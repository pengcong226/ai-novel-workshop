use rusqlite::{Connection, Result};
use tauri::State;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use instant_distance::{Builder, HnswMap, Point, Search};

// Helper macro to safely lock the database
macro_rules! lock_db {
    ($state:expr) => {
        $state.db.lock().map_err(|e| format!("Database lock poisoned: {}", e))?
    };
}

#[derive(Deserialize, Serialize)]
pub struct VectorDocument {
    pub id: String,
    pub collection: String,
    pub project_id: String,
    pub content: String,
    pub metadata: String,
    pub embedding: Vec<f32>,
    pub keywords: String,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub id: String,
    pub content: String,
    pub metadata: String,
    pub score: f32,
    pub source: String,
}

/// Custom point type for instant-distance
#[derive(Clone, Debug)]
struct VectorPoint(Vec<f32>);

impl Point for VectorPoint {
    fn distance(&self, other: &Self) -> f32 {
        // Cosine distance (1 - cosine similarity)
        let dot = self.0.iter().zip(other.0.iter()).map(|(a, b)| a * b).sum::<f32>();
        let norm_a = self.0.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b = other.0.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm_a == 0.0 || norm_b == 0.0 {
            return 1.0;
        }
        let similarity = dot / (norm_a * norm_b);
        1.0 - similarity
    }
}

/// In-memory HNSW index for fast nearest neighbor search
struct VectorIndex {
    index: HnswMap<VectorPoint, String>,
}

impl VectorIndex {
    fn build(points: Vec<(String, Vec<f32>)>) -> Result<Self> {
        if points.is_empty() {
            return Err(rusqlite::Error::InvalidQuery);
        }

        // Separate points and values
        let (points_vec, values_vec): (Vec<VectorPoint>, Vec<String>) = points
            .into_iter()
            .map(|(id, vec)| (VectorPoint(vec), id))
            .unzip();

        // Build HNSW index with optimized parameters
        let index = Builder::default()
            .ef_construction(200)
            .ef_search(100)
            .build(points_vec, values_vec);

        Ok(VectorIndex { index })
    }

    fn search(&self, query: &[f32], top_k: usize) -> Vec<(String, f32)> {
        let mut search = Search::default();
        let query_point = VectorPoint(query.to_vec());

        self.index
            .search(&query_point, &mut search)
            .take(top_k)
            .map(|item| {
                // Convert distance back to similarity
                let similarity = 1.0 - item.distance;
                (item.value.clone(), similarity)
            })
            .collect()
    }
}

pub fn init_vector_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS vectors (
            id TEXT PRIMARY KEY,
            collection TEXT NOT NULL,
            project_id TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT NOT NULL,
            embedding BLOB NOT NULL,
            keywords TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    // Index metadata table (stores when index was last built)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS vector_index_meta (
            collection TEXT NOT NULL,
            project_id TEXT NOT NULL,
            dimension INTEGER NOT NULL,
            doc_count INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (collection, project_id)
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_vectors_collection ON vectors(collection)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_vectors_project ON vectors(project_id)", [])?;
    Ok(())
}

#[tauri::command]
pub fn add_vector_documents(
    state: State<'_, crate::AppState>,
    documents: Vec<VectorDocument>,
) -> std::result::Result<(), String> {
    if documents.is_empty() {
        return Ok(());
    }

    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?
        .as_millis() as i64;

    {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO vectors
                (id, collection, project_id, content, metadata, embedding, keywords, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )
            .map_err(|e| format!("Failed to prepare insert statement: {}", e))?;

        for doc in &documents {
            let embedding_bytes = floats_to_bytes(&doc.embedding);
            stmt.execute(rusqlite::params![
                doc.id,
                doc.collection,
                doc.project_id,
                doc.content,
                doc.metadata,
                embedding_bytes,
                doc.keywords,
                now,
                now
            ])
            .map_err(|e| format!("Failed to insert vector document {}: {}", doc.id, e))?;
        }
    }

    // Invalidate affected indexes by updating doc_count to -1
    {
        let mut seen_keys = std::collections::HashSet::new();
        for doc in &documents {
            let key = (doc.collection.clone(), doc.project_id.clone());
            if !seen_keys.contains(&key) {
                tx.execute(
                    "UPDATE vector_index_meta SET doc_count = -1 WHERE collection = ?1 AND project_id = ?2",
                    rusqlite::params![doc.collection, doc.project_id],
                )
                .map_err(|e| format!("Failed to invalidate index for {}/{}: {}", doc.collection, doc.project_id, e))?;
                seen_keys.insert(key);
            }
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_vector_document(
    state: State<'_, crate::AppState>,
    id: String,
) -> std::result::Result<(), String> {
    let db = lock_db!(state);

    let result = db.query_row(
        "SELECT collection, project_id FROM vectors WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );

    if let Ok((collection, project_id)) = result {
        db.execute("DELETE FROM vectors WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| e.to_string())?;

        db.execute(
            "UPDATE vector_index_meta SET doc_count = -1 WHERE collection = ?1 AND project_id = ?2",
            rusqlite::params![collection, project_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_vector_documents(
    state: State<'_, crate::AppState>,
    collection: String,
    project_id: Option<String>,
    filter: Option<String>,
) -> std::result::Result<i64, String> {
    let mut db = lock_db!(state);

    let parsed_filter: Option<serde_json::Map<String, Value>> = match filter {
        Some(raw) if !raw.trim().is_empty() => {
            let value: Value = serde_json::from_str(&raw)
                .map_err(|e| format!("Invalid metadata filter JSON: {}", e))?;
            Some(
                value
                    .as_object()
                    .ok_or_else(|| "metadata filter must be a JSON object".to_string())?
                    .clone(),
            )
        }
        _ => None,
    };

    let mut candidate_ids: Vec<String> = Vec::new();
    let mut affected_projects = std::collections::HashSet::new();

    {
        let mut stmt = if project_id.is_some() {
            db.prepare(
                "SELECT id, metadata, project_id FROM vectors WHERE collection = ?1 AND project_id = ?2",
            )
            .map_err(|e| e.to_string())?
        } else {
            db.prepare("SELECT id, metadata, project_id FROM vectors WHERE collection = ?1")
                .map_err(|e| e.to_string())?
        };

        let mut rows = if let Some(ref pid) = project_id {
            stmt.query(rusqlite::params![collection, pid])
                .map_err(|e| e.to_string())?
        } else {
            stmt.query(rusqlite::params![collection])
                .map_err(|e| e.to_string())?
        };

        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let id: String = row.get(0).map_err(|e| e.to_string())?;
            let metadata_raw: String = row.get(1).map_err(|e| e.to_string())?;
            let pid: String = row.get(2).map_err(|e| e.to_string())?;

            if let Some(ref filter_obj) = parsed_filter {
                let metadata_value: Value = serde_json::from_str(&metadata_raw)
                    .map_err(|e| format!("Invalid metadata JSON for id {}: {}", id, e))?;

                if !metadata_matches_filter(&metadata_value, filter_obj) {
                    continue;
                }
            }

            candidate_ids.push(id);
            affected_projects.insert(pid);
        }
    }

    if candidate_ids.is_empty() {
        return Ok(0);
    }

    let tx = db.transaction().map_err(|e| e.to_string())?;

    {
        let mut delete_stmt = tx
            .prepare("DELETE FROM vectors WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        for id in &candidate_ids {
            delete_stmt
                .execute(rusqlite::params![id])
                .map_err(|e| e.to_string())?;
        }
    }

    for pid in &affected_projects {
        tx.execute(
            "UPDATE vector_index_meta SET doc_count = -1 WHERE collection = ?1 AND project_id = ?2",
            rusqlite::params![collection, pid],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(candidate_ids.len() as i64)
}

#[tauri::command]
pub fn get_vector_document(
    state: State<'_, crate::AppState>,
    collection: String,
    id: String,
) -> std::result::Result<Option<VectorDocument>, String> {
    let db = lock_db!(state);

    let result = db.query_row(
        "SELECT id, collection, project_id, content, metadata, embedding, keywords FROM vectors WHERE collection = ?1 AND id = ?2",
        rusqlite::params![collection, id],
        |row| {
            let embedding_bytes: Vec<u8> = row.get(5)?;
            match bytes_to_floats(&embedding_bytes) {
                Ok(embedding) => Ok(VectorDocument {
                    id: row.get(0)?,
                    collection: row.get(1)?,
                    project_id: row.get(2)?,
                    content: row.get(3)?,
                    metadata: row.get(4)?,
                    embedding,
                    keywords: row.get(6)?,
                }),
                Err(e) => Err(rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e)))),
            }
        },
    );

    match result {
        Ok(doc) => Ok(Some(doc)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_vector_collection(
    state: State<'_, crate::AppState>,
    collection: String,
) -> std::result::Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "DELETE FROM vectors WHERE collection = ?1",
        rusqlite::params![collection],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM vector_index_meta WHERE collection = ?1",
        rusqlite::params![collection],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_vector_document_count(
    state: State<'_, crate::AppState>,
    collection: String,
    project_id: Option<String>,
) -> std::result::Result<i64, String> {
    let db = lock_db!(state);
    let count: i64 = if let Some(ref pid) = project_id {
        db.query_row(
            "SELECT COUNT(*) FROM vectors WHERE collection = ?1 AND project_id = ?2",
            rusqlite::params![collection, pid],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    } else {
        db.query_row(
            "SELECT COUNT(*) FROM vectors WHERE collection = ?1",
            rusqlite::params![collection],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    };
    Ok(count)
}

/// Build HNSW index for a collection+project
fn build_index(
    db: &rusqlite::Connection,
    collection: &str,
    project_id: &str,
) -> std::result::Result<VectorIndex, String> {
    let mut stmt = db
        .prepare("SELECT id, embedding FROM vectors WHERE collection = ?1 AND project_id = ?2")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![collection, project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut docs: Vec<(String, Vec<f32>)> = Vec::new();
    for row in rows {
        let (id, embedding_bytes) = row.map_err(|e| e.to_string())?;
        let embedding = bytes_to_floats(&embedding_bytes)?;
        docs.push((id, embedding));
    }

    if docs.is_empty() {
        return Err("No vectors found for indexing".to_string());
    }

    let dimension = docs[0].1.len();
    let doc_count = docs.len();
    let index = VectorIndex::build(docs).map_err(|e| format!("Failed to build index: {:?}", e))?;

    // Save metadata
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?
        .as_millis() as i64;

    db.execute(
        "INSERT OR REPLACE INTO vector_index_meta (collection, project_id, dimension, doc_count, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![collection, project_id, dimension, doc_count as i64, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(index)
}

/// Check if index needs rebuilding and rebuild if necessary
fn get_or_build_index(
    db: &rusqlite::Connection,
    collection: &str,
    project_id: &str,
) -> std::result::Result<VectorIndex, String> {
    // Check if index exists and is valid
    let index_valid: bool = db
        .query_row(
            "SELECT v.doc_count = (SELECT COUNT(*) FROM vectors WHERE collection = ?1 AND project_id = ?2)
             FROM vector_index_meta v
             WHERE v.collection = ?1 AND v.project_id = ?2 AND v.doc_count > 0",
            rusqlite::params![collection, project_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) == 1;

    if index_valid {
        // Index is valid, rebuild it (we need to rebuild in-memory anyway)
        // In production, you'd cache this in memory
    }

    build_index(db, collection, project_id)
}

#[tauri::command]
pub fn vector_search(
    state: State<'_, crate::AppState>,
    collection: String,
    project_id: Option<String>,
    query_embedding: Vec<f32>,
    top_k: usize,
    min_score: f32,
) -> std::result::Result<Vec<SearchResult>, String> {
    let db = lock_db!(state);

    // Use HNSW index for project-specific search (O(log n))
    if let Some(ref pid) = project_id {
        let index = get_or_build_index(&db, &collection, pid)?;

        let candidates = index.search(&query_embedding, top_k * 2);

        let mut results = Vec::new();
        for (doc_id, score) in candidates {
            if score < min_score {
                continue;
            }

            let result = db.query_row(
                "SELECT content, metadata FROM vectors WHERE id = ?1",
                rusqlite::params![doc_id],
                |row| {
                    Ok(SearchResult {
                        id: doc_id.clone(),
                        content: row.get(0)?,
                        metadata: row.get(1)?,
                        score,
                        source: "vector".to_string(),
                    })
                },
            );

            if let Ok(result) = result {
                results.push(result);
            }

            if results.len() >= top_k {
                break;
            }
        }

        Ok(results)
    } else {
        // Fallback to brute-force for global search
        brute_force_search(&db, &collection, None, &query_embedding, top_k, min_score)
    }
}

fn brute_force_search(
    db: &rusqlite::Connection,
    collection: &str,
    project_id: Option<&String>,
    query_embedding: &[f32],
    top_k: usize,
    min_score: f32,
) -> std::result::Result<Vec<SearchResult>, String> {
    let mut stmt = if project_id.is_some() {
        db.prepare(
            "SELECT id, content, metadata, embedding FROM vectors WHERE collection = ?1 AND project_id = ?2",
        )
        .map_err(|e| e.to_string())?
    } else {
        db.prepare("SELECT id, content, metadata, embedding FROM vectors WHERE collection = ?1")
            .map_err(|e| e.to_string())?
    };

    let mut rows = if let Some(pid) = project_id {
        stmt.query(rusqlite::params![collection, pid])
            .map_err(|e| e.to_string())?
    } else {
        stmt.query(rusqlite::params![collection])
            .map_err(|e| e.to_string())?
    };

    let mut results = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).map_err(|e| e.to_string())?;
        let content: String = row.get(1).map_err(|e| e.to_string())?;
        let metadata: String = row.get(2).map_err(|e| e.to_string())?;
        let embedding_bytes: Vec<u8> = row.get(3).map_err(|e| e.to_string())?;

        let doc_embedding = bytes_to_floats(&embedding_bytes)?;
        let score = cosine_similarity(query_embedding, &doc_embedding);

        if score >= min_score {
            results.push(SearchResult {
                id,
                content,
                metadata,
                score,
                source: "vector".to_string(),
            });
        }
    }

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    results.truncate(top_k);

    Ok(results)
}

fn floats_to_bytes(floats: &[f32]) -> Vec<u8> {
    floats.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn bytes_to_floats(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if bytes.len() % 4 != 0 {
        return Err(format!("Invalid embedding data length: {} bytes (not divisible by 4)", bytes.len()));
    }

    bytes
        .chunks_exact(4)
        .map(|chunk| {
            chunk
                .try_into()
                .map(f32::from_le_bytes)
                .map_err(|_| "Invalid embedding data: expected 4 bytes per float".to_string())
        })
        .collect()
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }
    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;
    for (x, y) in a.iter().zip(b.iter()) {
        dot_product += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot_product / (norm_a.sqrt() * norm_b.sqrt())
}

fn metadata_matches_filter(
    metadata: &Value,
    filter: &serde_json::Map<String, Value>,
) -> bool {
    let Some(obj) = metadata.as_object() else {
        return false;
    };

    for (key, expected) in filter {
        let Some(actual) = obj.get(key) else {
            return false;
        };

        if !json_value_equals(actual, expected) {
            return false;
        }
    }

    true
}

fn json_value_equals(actual: &Value, expected: &Value) -> bool {
    if actual == expected {
        return true;
    }

    match (actual, expected) {
        (Value::Number(a), Value::String(b)) => a.to_string() == *b,
        (Value::String(a), Value::Number(b)) => *a == b.to_string(),
        (Value::Bool(a), Value::String(b)) => a.to_string() == *b,
        (Value::String(a), Value::Bool(b)) => *a == b.to_string(),
        _ => false,
    }
}
