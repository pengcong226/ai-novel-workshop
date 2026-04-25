use rusqlite::{Connection, OptionalExtension, Result};
use std::collections::HashSet;
use std::sync::{Mutex, RwLock};
use tauri::{Manager, State};

mod macros;
mod vector;

struct AppState {
    db: Mutex<Connection>,
    vector_index_cache: RwLock<Option<(String, String, std::sync::Arc<vector::VectorIndex>)>>,
}

const MAX_ID_LENGTH: usize = 256;
const MAX_CHAPTERS_PER_REORDER: usize = 20_000;
const MAX_SNAPSHOT_BYTES: usize = 2 * 1024 * 1024;
const MAX_SNAPSHOTS_TO_KEEP: i64 = 1_000;

fn validate_id(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > MAX_ID_LENGTH {
        return Err(format!("Invalid {}", label));
    }
    Ok(())
}

fn validate_snapshot_scope(snapshot: &serde_json::Value, snapshot_id: &str, project_id: &str, chapter_id: &str, created_at: i64) -> Result<(), String> {
    if snapshot.get("id").and_then(|value| value.as_str()) != Some(snapshot_id)
        || snapshot.get("projectId").and_then(|value| value.as_str()) != Some(project_id)
        || snapshot.get("chapterId").and_then(|value| value.as_str()) != Some(chapter_id)
        || snapshot.get("createdAt").and_then(|value| value.as_i64()) != Some(created_at)
    {
        return Err("Chapter snapshot scope does not match command parameters".to_string());
    }
    Ok(())
}

fn process_and_save_project_blob(
    db: &Connection,
    id: &str,
    data: &str,
    characters: Option<Vec<String>>,
    worldbook: Option<Vec<String>>,
) -> Result<(), String> {
    db.execute(
        "INSERT OR REPLACE INTO projects (id, data) VALUES (?1, ?2)",
        rusqlite::params![id, data],
    )
    .map_err(|e| e.to_string())?;

    if let Some(chars) = characters {
        let mut seen_ids = HashSet::new();
        let mut stmt = db.prepare("INSERT OR REPLACE INTO characters (id, project_id, data) VALUES (?1, ?2, ?3)").map_err(|e| e.to_string())?;
        for ch_str in chars {
            let ch = serde_json::from_str::<serde_json::Value>(&ch_str)
                .map_err(|e| format!("Failed to parse character: {}", e))?;
            let ch_id = ch.get("id")
                .and_then(|id| id.as_str())
                .ok_or_else(|| "Character missing ID".to_string())?;
            seen_ids.insert(ch_id.to_string());
            stmt.execute(rusqlite::params![ch_id, id, &ch_str]).map_err(|e| e.to_string())?;
        }
        drop(stmt);

        if let Ok(mut stmt) = db.prepare("SELECT id FROM characters WHERE project_id = ?1") {
            if let Ok(rows) = stmt.query_map(rusqlite::params![id], |row| row.get::<_, String>(0)) {
                for ext_id in rows.filter_map(Result::ok) {
                    if !seen_ids.contains(&ext_id) {
                        let _ = db.execute("DELETE FROM characters WHERE project_id = ?1 AND id = ?2", rusqlite::params![id, ext_id]);
                    }
                }
            }
        }
    }

    if let Some(entries) = worldbook {
        let mut seen_ids = HashSet::new();
        let mut stmt = db.prepare("INSERT OR REPLACE INTO worldbooks (id, project_id, data) VALUES (?1, ?2, ?3)").map_err(|e| e.to_string())?;
        for entry_str in entries {
            let entry = serde_json::from_str::<serde_json::Value>(&entry_str)
                .map_err(|e| format!("Failed to parse worldbook entry: {}", e))?;
            let entry_id = entry.get("id")
                .and_then(|id| id.as_str())
                .ok_or_else(|| "Worldbook entry missing ID".to_string())?;
            seen_ids.insert(entry_id.to_string());
            stmt.execute(rusqlite::params![entry_id, id, &entry_str]).map_err(|e| e.to_string())?;
        }
        drop(stmt);

        if let Ok(mut stmt) = db.prepare("SELECT id FROM worldbooks WHERE project_id = ?1") {
            if let Ok(rows) = stmt.query_map(rusqlite::params![id], |row| row.get::<_, String>(0)) {
                for ext_id in rows.filter_map(Result::ok) {
                    if !seen_ids.contains(&ext_id) {
                        let _ = db.execute("DELETE FROM worldbooks WHERE project_id = ?1 AND id = ?2", rusqlite::params![id, ext_id]);
                    }
                }
            }
        }
    }

    Ok(())
}

fn do_load_project_skeleton(db: &Connection, id: &str) -> Result<String, String> {
    let mut stmt = db
        .prepare("SELECT data FROM projects WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    let project_data: String = if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        row.get(0).map_err(|e| e.to_string())?
    } else {
        return Err("Project not found".to_string());
    };

    let mut v: serde_json::Value =
        serde_json::from_str(&project_data).map_err(|e| e.to_string())?;

    // Load characters
    let mut char_stmt = db
        .prepare("SELECT data FROM characters WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut char_rows = char_stmt
        .query(rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    let mut characters = Vec::new();
    while let Some(row) = char_rows.next().map_err(|e| e.to_string())? {
        let char_data: String = row.get(0).map_err(|e| e.to_string())?;
        if let Ok(ch) = serde_json::from_str::<serde_json::Value>(&char_data) {
            characters.push(ch);
        }
    }
    v["characters"] = serde_json::Value::Array(characters);

    // Load worldbook entries
    let mut wb_stmt = db
        .prepare("SELECT data FROM worldbooks WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut wb_rows = wb_stmt
        .query(rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    let mut wb_entries = Vec::new();
    while let Some(row) = wb_rows.next().map_err(|e| e.to_string())? {
        let wb_data: String = row.get(0).map_err(|e| e.to_string())?;
        if let Ok(entry) = serde_json::from_str::<serde_json::Value>(&wb_data) {
            wb_entries.push(entry);
        }
    }

    if let Some(wb) = v.get_mut("worldbook").and_then(|w| w.as_object_mut()) {
        wb.insert("entries".to_string(), serde_json::Value::Array(wb_entries));
    } else if !wb_entries.is_empty() {
        v["worldbook"] = serde_json::json!({ "entries": wb_entries });
    }

    serde_json::to_string(&v).map_err(|e| e.to_string())
}

fn extract_chapter_id(chap_str: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(chap_str)
        .ok()
        .and_then(|v| v.get("id")?.as_str().map(|s| s.to_string()))
}

#[tauri::command]
fn save_project_with_chapters(
    state: State<'_, AppState>,
    id: String,
    project_data: String,
    chapters_data: Vec<String>,
    characters_data: Option<Vec<String>>,
    worldbook_data: Option<Vec<String>>,
) -> Result<(), String> {
    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;

    process_and_save_project_blob(&tx, &id, &project_data, characters_data, worldbook_data)?;

    tx.execute(
        "DELETE FROM chapters WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;

    let mut retained_chapter_ids = Vec::new();
    let mut stmt = tx
        .prepare("INSERT INTO chapters (id, project_id, data) VALUES (?1, ?2, ?3)")
        .map_err(|e| e.to_string())?;
    for (i, chap_str) in chapters_data.iter().enumerate() {
        let fallback_id = format!("{}_chap_{}", id, i);
        let extracted_id = extract_chapter_id(chap_str).unwrap_or(fallback_id);
        retained_chapter_ids.push(extracted_id.clone());

        let mut chapter_value: serde_json::Value = serde_json::from_str(chap_str)
            .map_err(|e| format!("Invalid chapter JSON: {}", e))?;
        let chapter_object = chapter_value
            .as_object_mut()
            .ok_or_else(|| "Chapter JSON must be an object".to_string())?;
        chapter_object.insert("id".to_string(), serde_json::Value::from(extracted_id.clone()));
        chapter_object.insert("projectId".to_string(), serde_json::Value::from(id.clone()));
        let chapter_data = serde_json::to_string(&chapter_value).map_err(|e| e.to_string())?;

        stmt.execute(rusqlite::params![extracted_id, &id, chapter_data])
            .map_err(|e| e.to_string())?;
    }
    drop(stmt);

    if retained_chapter_ids.is_empty() {
        tx.execute(
            "DELETE FROM chapter_snapshots WHERE project_id = ?1",
            rusqlite::params![&id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        tx.execute(
            "DELETE FROM chapter_snapshots WHERE project_id = ?1 AND NOT EXISTS (SELECT 1 FROM chapters WHERE chapters.project_id = chapter_snapshots.project_id AND chapters.id = chapter_snapshots.chapter_id)",
            rusqlite::params![&id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_project(
    state: State<'_, AppState>,
    id: String,
    data: String,
    characters: Option<Vec<String>>,
    worldbook: Option<Vec<String>>,
) -> Result<(), String> {
    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;

    process_and_save_project_blob(&tx, &id, &data, characters, worldbook)?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_chapter(
    state: State<'_, AppState>,
    project_id: String,
    chapter_id: String,
    data: String,
) -> Result<(), String> {
    validate_id(&project_id, "project id")?;
    validate_id(&chapter_id, "chapter id")?;

    let mut incoming_chapter: serde_json::Value = serde_json::from_str(&data)
        .map_err(|e| format!("Invalid chapter JSON: {}", e))?;
    let incoming_object = incoming_chapter
        .as_object_mut()
        .ok_or_else(|| "Chapter JSON must be an object".to_string())?;
    if incoming_object.get("id").and_then(|value| value.as_str()) != Some(chapter_id.as_str()) {
        return Err("Chapter id does not match command parameter".to_string());
    }
    incoming_object.insert("projectId".to_string(), serde_json::Value::from(project_id.clone()));

    let db = lock_db!(state);
    let existing_scope = db
        .query_row(
            "SELECT project_id, data FROM chapters WHERE id = ?1",
            rusqlite::params![&chapter_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((existing_project_id, _)) = &existing_scope {
        if existing_project_id != &project_id {
            return Err("Chapter id belongs to another project".to_string());
        }
    }
    let existing_number = existing_scope
        .as_ref()
        .and_then(|(_, existing_data)| serde_json::from_str::<serde_json::Value>(existing_data).ok())
        .and_then(|value| value.get("number").and_then(|number| number.as_i64()).map(serde_json::Value::from));

    if let Some(number) = existing_number {
        incoming_object.insert("number".to_string(), number);
    }
    let data = serde_json::to_string(&incoming_chapter).map_err(|e| e.to_string())?;

    db.execute(
        "INSERT OR REPLACE INTO chapters (id, project_id, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![chapter_id, project_id, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reorder_chapters(
    state: State<'_, AppState>,
    project_id: String,
    ordered_ids: Vec<String>,
) -> Result<(), String> {
    if let Err(error) = validate_id(&project_id, "project id") {
        return Err(error);
    }
    if ordered_ids.len() > MAX_CHAPTERS_PER_REORDER {
        return Err("Chapter order payload is too large".to_string());
    }

    let mut seen_ids = HashSet::new();
    for chapter_id in &ordered_ids {
        validate_id(chapter_id, "chapter id")?;
        if !seen_ids.insert(chapter_id.clone()) {
            return Err("Chapter order contains duplicate ids".to_string());
        }
    }

    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let mut stmt = tx
        .prepare("SELECT id, data FROM chapters WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![&project_id])
        .map_err(|e| e.to_string())?;

    let mut chapters = std::collections::HashMap::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let chapter_id: String = row.get(0).map_err(|e| e.to_string())?;
        let data: String = row.get(1).map_err(|e| e.to_string())?;
        chapters.insert(chapter_id, data);
    }
    drop(rows);
    drop(stmt);

    if chapters.len() != ordered_ids.len() {
        return Err("Chapter order does not match stored chapters".to_string());
    }

    for (index, chapter_id) in ordered_ids.iter().enumerate() {
        let data = chapters
            .get(chapter_id)
            .ok_or_else(|| "Chapter order references missing chapter".to_string())?;
        let mut chapter_value: serde_json::Value = serde_json::from_str(data)
            .map_err(|e| format!("Invalid chapter JSON: {}", e))?;
        let chapter_object = chapter_value
            .as_object_mut()
            .ok_or_else(|| "Stored chapter JSON must be an object".to_string())?;
        if chapter_object.get("id").and_then(|value| value.as_str()) != Some(chapter_id.as_str()) {
            return Err("Stored chapter id does not match row id".to_string());
        }
        match chapter_object.get("projectId").and_then(|value| value.as_str()) {
            Some(stored_project_id) if stored_project_id != project_id.as_str() => {
                return Err("Stored chapter project id does not match row project".to_string());
            }
            _ => {}
        }
        chapter_object.insert("projectId".to_string(), serde_json::Value::from(project_id.clone()));
        chapter_object.insert("number".to_string(), serde_json::Value::from((index + 1) as i64));
        let updated_data = serde_json::to_string(&chapter_value).map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE chapters SET data = ?1 WHERE project_id = ?2 AND id = ?3",
            rusqlite::params![updated_data, &project_id, chapter_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_chapter_snapshot(
    state: State<'_, AppState>,
    snapshot_id: String,
    project_id: String,
    chapter_id: String,
    data: String,
    created_at: i64,
) -> Result<(), String> {
    validate_id(&snapshot_id, "snapshot id")?;
    validate_id(&project_id, "project id")?;
    validate_id(&chapter_id, "chapter id")?;
    if data.len() > MAX_SNAPSHOT_BYTES {
        return Err("Chapter snapshot payload is too large".to_string());
    }

    let snapshot: serde_json::Value = serde_json::from_str(&data)
        .map_err(|e| format!("Invalid chapter snapshot JSON: {}", e))?;
    validate_snapshot_scope(&snapshot, &snapshot_id, &project_id, &chapter_id, created_at)?;

    let db = lock_db!(state);
    let existing_snapshot_scope = db
        .query_row(
            "SELECT project_id, chapter_id FROM chapter_snapshots WHERE id = ?1",
            rusqlite::params![&snapshot_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((existing_project_id, existing_chapter_id)) = existing_snapshot_scope {
        if existing_project_id != project_id || existing_chapter_id != chapter_id {
            return Err("Chapter snapshot id belongs to another chapter".to_string());
        }
    }

    let chapter_exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM chapters WHERE project_id = ?1 AND id = ?2)",
            rusqlite::params![&project_id, &chapter_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !chapter_exists {
        return Err("Chapter snapshot references missing chapter".to_string());
    }

    db.execute(
        "INSERT OR REPLACE INTO chapter_snapshots (id, project_id, chapter_id, created_at, data) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![snapshot_id, project_id, chapter_id, created_at, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_chapter_snapshots(
    state: State<'_, AppState>,
    chapter_id: String,
    project_id: String,
) -> Result<String, String> {
    validate_id(&chapter_id, "chapter id")?;
    validate_id(&project_id, "project id")?;

    let db = lock_db!(state);
    let mut stmt = db
        .prepare("SELECT data FROM chapter_snapshots WHERE chapter_id = ?1 AND project_id = ?2 ORDER BY created_at DESC, id DESC")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![chapter_id, project_id])
        .map_err(|e| e.to_string())?;

    let mut snapshots = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let data: String = row.get(0).map_err(|e| e.to_string())?;
        let snapshot = serde_json::from_str::<serde_json::Value>(&data)
            .map_err(|e| format!("Invalid stored chapter snapshot JSON: {}", e))?;
        snapshots.push(snapshot);
    }

    serde_json::to_string(&snapshots).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_chapter_snapshot(
    state: State<'_, AppState>,
    snapshot_id: String,
    project_id: String,
    chapter_id: String,
) -> Result<Option<String>, String> {
    validate_id(&snapshot_id, "snapshot id")?;
    validate_id(&project_id, "project id")?;
    validate_id(&chapter_id, "chapter id")?;

    let db = lock_db!(state);
    let mut stmt = db
        .prepare("SELECT data FROM chapter_snapshots WHERE id = ?1 AND project_id = ?2 AND chapter_id = ?3")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![snapshot_id, project_id, chapter_id])
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let data: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(data))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn delete_chapter_snapshot(
    state: State<'_, AppState>,
    snapshot_id: String,
    project_id: String,
    chapter_id: String,
) -> Result<(), String> {
    validate_id(&snapshot_id, "snapshot id")?;
    validate_id(&project_id, "project id")?;
    validate_id(&chapter_id, "chapter id")?;

    let db = lock_db!(state);
    db.execute(
        "DELETE FROM chapter_snapshots WHERE id = ?1 AND project_id = ?2 AND chapter_id = ?3",
        rusqlite::params![snapshot_id, project_id, chapter_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn prune_chapter_snapshots(
    state: State<'_, AppState>,
    chapter_id: String,
    project_id: String,
    keep_count: i64,
) -> Result<i64, String> {
    validate_id(&chapter_id, "chapter id")?;
    validate_id(&project_id, "project id")?;
    if !(0..=MAX_SNAPSHOTS_TO_KEEP).contains(&keep_count) {
        return Err("Invalid snapshot keep count".to_string());
    }

    let db = lock_db!(state);
    let deleted = db
        .execute(
            "DELETE FROM chapter_snapshots WHERE chapter_id = ?1 AND project_id = ?2 AND id NOT IN (SELECT id FROM chapter_snapshots WHERE chapter_id = ?1 AND project_id = ?2 ORDER BY created_at DESC, id DESC LIMIT ?3)",
            rusqlite::params![chapter_id, project_id, keep_count],
        )
        .map_err(|e| e.to_string())?;
    Ok(deleted as i64)
}

#[tauri::command]
fn clear_project_chapters(state: State<'_, AppState>, project_id: String) -> Result<(), String> {
    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM chapter_snapshots WHERE project_id = ?1",
        rusqlite::params![&project_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM chapters WHERE project_id = ?1",
        rusqlite::params![&project_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_project(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let db = lock_db!(state);

    // Load assembled project skeleton
    let project_data = do_load_project_skeleton(&db, &id)?;

    // Load chapters
    let mut chap_stmt = db
        .prepare("SELECT data FROM chapters WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut chap_rows = chap_stmt
        .query(rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    let mut chapters = Vec::new();
    while let Some(row) = chap_rows.next().map_err(|e| e.to_string())? {
        let chap_data: String = row.get(0).map_err(|e| e.to_string())?;
        if let Ok(chapter) = serde_json::from_str::<serde_json::Value>(&chap_data) {
            chapters.push(chapter);
        }
    }
    chapters.sort_by_key(|chapter| chapter.get("number").and_then(|number| number.as_i64()).unwrap_or(0));

    let mut project_value: serde_json::Value = serde_json::from_str(&project_data)
        .map_err(|e| format!("Failed to parse project JSON: {}", e))?;

    project_value["chapters"] = serde_json::Value::Array(chapters);

    serde_json::to_string(&project_value)
        .map_err(|e| format!("Failed to serialize project JSON: {}", e))
}

#[tauri::command]
fn load_project_skeleton(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let db = lock_db!(state);
    do_load_project_skeleton(&db, &id)
}

#[tauri::command]
fn load_chapters_metadata(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<String, String> {
    let db = lock_db!(state);
    let mut chap_stmt = db
        .prepare("SELECT data FROM chapters WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut chap_rows = chap_stmt
        .query(rusqlite::params![project_id])
        .map_err(|e| e.to_string())?;

    let mut chapters = Vec::new();
    while let Some(row) = chap_rows.next().map_err(|e| e.to_string())? {
        let chap_data: String = row.get(0).map_err(|e| e.to_string())?;

        if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&chap_data) {
            if let Some(obj) = v.as_object_mut() {
                obj.remove("content");
            }
            chapters.push(v);
        }
    }
    chapters.sort_by_key(|chapter| chapter.get("number").and_then(|number| number.as_i64()).unwrap_or(0));

    serde_json::to_string(&chapters).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_chapter(
    state: State<'_, AppState>,
    project_id: String,
    chapter_id: String,
) -> Result<String, String> {
    let db = lock_db!(state);
    let mut stmt = db
        .prepare("SELECT data FROM chapters WHERE project_id = ?1 AND id = ?2")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![project_id, chapter_id])
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let data: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(data)
    } else {
        Err("Chapter not found".to_string())
    }
}


#[tauri::command]
fn load_projects_list(state: State<'_, AppState>) -> Result<String, String> {
    let db = lock_db!(state);
    let mut stmt = db
        .prepare("SELECT data FROM projects_meta")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let data: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(data)
    } else {
        Ok("[]".to_string())
    }
}

#[tauri::command]
fn save_projects_list(state: State<'_, AppState>, data: String) -> Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "INSERT OR REPLACE INTO projects_meta (id, data) VALUES (1, ?1)",
        rusqlite::params![data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![&id])
        .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM chapters WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM chapter_snapshots WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM characters WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM worldbooks WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM entities WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM state_events WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_single_chapter(
    state: State<'_, AppState>,
    project_id: String,
    chapter_id: String,
) -> Result<(), String> {
    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM chapter_snapshots WHERE project_id = ?1 AND chapter_id = ?2",
        rusqlite::params![&project_id, &chapter_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM chapters WHERE project_id = ?1 AND id = ?2",
        rusqlite::params![&project_id, &chapter_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_character_atomic(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
    data: String,
) -> Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "INSERT OR REPLACE INTO characters (id, project_id, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![character_id, project_id, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_worldbook_entry_atomic(
    state: State<'_, AppState>,
    project_id: String,
    entry_id: String,
    data: String,
) -> Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "INSERT OR REPLACE INTO worldbooks (id, project_id, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![entry_id, project_id, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_character(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
) -> Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "DELETE FROM characters WHERE project_id = ?1 AND id = ?2",
        rusqlite::params![project_id, character_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_worldbook_entry(
    state: State<'_, AppState>,
    project_id: String,
    entry_id: String,
    data: String,
) -> Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "INSERT OR REPLACE INTO worldbooks (id, project_id, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![entry_id, project_id, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_worldbook_entry(
    state: State<'_, AppState>,
    project_id: String,
    entry_id: String,
) -> Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "DELETE FROM worldbooks WHERE project_id = ?1 AND id = ?2",
        rusqlite::params![project_id, entry_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}


#[tauri::command]
fn save_entity(
    state: State<'_, AppState>,
    project_id: String,
    entity_json: String,
) -> Result<(), String> {
    let v: serde_json::Value = serde_json::from_str(&entity_json).map_err(|e| e.to_string())?;
    let id = v["id"].as_str().unwrap_or_default().to_string();
    if id.is_empty() {
        return Err("Entity ID cannot be empty".to_string());
    }
    let entity_type = v["type"].as_str().unwrap_or_default().to_string();
    let name = v["name"].as_str().unwrap_or_default().to_string();
    let aliases = v["aliases"].as_array()
        .map(|arr| serde_json::to_string(arr).unwrap_or_else(|_| "[]".to_string()))
        .unwrap_or_else(|| "[]".to_string());
    let importance = v["importance"].as_str().unwrap_or_default().to_string();
    let category = v["category"].as_str().unwrap_or_default().to_string();
    let system_prompt = v["systemPrompt"].as_str().unwrap_or_default().to_string();
    let visual_meta = v["visualMeta"].to_string();
    let is_archived = if v["isArchived"].as_bool().unwrap_or(false) { 1 } else { 0 };
    let created_at = v["createdAt"].as_i64().unwrap_or(0);

    let db = lock_db!(state);
    db.execute(
        "INSERT OR REPLACE INTO entities (id, project_id, entity_type, name, aliases, importance, category, system_prompt, visual_meta, is_archived, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![id, project_id, entity_type, name, aliases, importance, category, system_prompt, visual_meta, is_archived, created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_state_event(
    state: State<'_, AppState>,
    project_id: String,
    event_json: String,
) -> Result<(), String> {
    let v: serde_json::Value = serde_json::from_str(&event_json).map_err(|e| e.to_string())?;
    let id = v["id"].as_str().unwrap_or_default().to_string();
    if id.is_empty() {
        return Err("State event ID cannot be empty".to_string());
    }
    let chapter_number = v["chapterNumber"].as_i64().unwrap_or(0);
    let entity_id = v["entityId"].as_str().unwrap_or_default().to_string();
    let event_type = v["eventType"].as_str().unwrap_or_default().to_string();
    let payload = v["payload"].to_string();
    let source = v["source"].as_str().unwrap_or_default().to_string();

    let db = lock_db!(state);
    db.execute(
        "INSERT OR REPLACE INTO state_events (id, project_id, chapter_number, entity_id, event_type, payload, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, project_id, chapter_number, entity_id, event_type, payload, source],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_entity(
    state: State<'_, AppState>,
    project_id: String,
    entity_id: String,
) -> Result<(), String> {
    let db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let rows = tx.execute(
        "DELETE FROM entities WHERE project_id = ?1 AND id = ?2",
        rusqlite::params![project_id, entity_id],
    )
    .map_err(|e| e.to_string())?;
    if rows == 0 {
        return Err(format!("Entity not found: {}", entity_id));
    }
    tx.execute(
        "DELETE FROM state_events WHERE project_id = ?1 AND entity_id = ?2",
        rusqlite::params![project_id, entity_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_state_event(
    state: State<'_, AppState>,
    project_id: String,
    event_id: String,
) -> Result<(), String> {
    let db = lock_db!(state);
    let rows = db.execute(
        "DELETE FROM state_events WHERE project_id = ?1 AND id = ?2",
        rusqlite::params![project_id, event_id],
    )
    .map_err(|e| e.to_string())?;
    if rows == 0 {
        return Err(format!("State event not found: {}", event_id));
    }
    Ok(())
}

#[tauri::command]
fn delete_state_events_by_range(
    state: State<'_, AppState>,
    project_id: String,
    start_chapter: i64,
    end_chapter: i64,
) -> Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "DELETE FROM state_events WHERE project_id = ?1 AND chapter_number >= ?2 AND chapter_number <= ?3",
        rusqlite::params![project_id, start_chapter, end_chapter],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn batch_save_entities(
    state: State<'_, AppState>,
    project_id: String,
    entities_json: String,
) -> Result<(), String> {
    let arr: Vec<serde_json::Value> = serde_json::from_str(&entities_json).map_err(|e| e.to_string())?;
    let db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for v in &arr {
        let id = v["id"].as_str().unwrap_or_default().to_string();
        if id.is_empty() {
            continue;
        }
        let entity_type = v["type"].as_str().unwrap_or_default().to_string();
        let name = v["name"].as_str().unwrap_or_default().to_string();
        let aliases = v["aliases"].to_string();
        let importance = v["importance"].as_str().unwrap_or_default().to_string();
        let category = v["category"].as_str().unwrap_or_default().to_string();
        let system_prompt = v["systemPrompt"].as_str().unwrap_or_default().to_string();
        let visual_meta = v["visualMeta"].to_string();
        let is_archived = v["isArchived"].as_bool().unwrap_or(false);
        let created_at = v["createdAt"].as_i64().unwrap_or(0);
        tx.execute(
            "INSERT OR REPLACE INTO entities (id, project_id, entity_type, name, aliases, importance, category, system_prompt, visual_meta, is_archived, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![id, project_id, entity_type, name, aliases, importance, category, system_prompt, visual_meta, is_archived, created_at],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn batch_save_state_events(
    state: State<'_, AppState>,
    project_id: String,
    events_json: String,
) -> Result<(), String> {
    let arr: Vec<serde_json::Value> = serde_json::from_str(&events_json).map_err(|e| e.to_string())?;
    let db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for v in &arr {
        let id = v["id"].as_str().unwrap_or_default().to_string();
        if id.is_empty() {
            continue;
        }
        let chapter_number = v["chapterNumber"].as_i64().unwrap_or(0);
        let entity_id = v["entityId"].as_str().unwrap_or_default().to_string();
        let event_type = v["eventType"].as_str().unwrap_or_default().to_string();
        let payload = v["payload"].to_string();
        let source = v["source"].as_str().unwrap_or_default().to_string();
        tx.execute(
            "INSERT OR REPLACE INTO state_events (id, project_id, chapter_number, entity_id, event_type, payload, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![id, project_id, chapter_number, entity_id, event_type, payload, source],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn replace_sandbox_data(
    state: State<'_, AppState>,
    project_id: String,
    entities_json: String,
    events_json: String,
) -> Result<(), String> {
    validate_id(&project_id, "project id")?;

    let entities: Vec<serde_json::Value> = serde_json::from_str(&entities_json).map_err(|e| e.to_string())?;
    let events: Vec<serde_json::Value> = serde_json::from_str(&events_json).map_err(|e| e.to_string())?;
    let mut entity_ids = HashSet::new();
    let mut event_ids = HashSet::new();

    for v in &entities {
        let id = v.get("id").and_then(|value| value.as_str()).ok_or_else(|| "Entity missing id".to_string())?;
        validate_id(id, "entity id")?;
        if !entity_ids.insert(id.to_string()) {
            return Err("Duplicate entity id".to_string());
        }
        if let Some(row_project_id) = v.get("projectId").and_then(|value| value.as_str()) {
            if row_project_id != project_id.as_str() {
                return Err("Entity projectId does not match restore project".to_string());
            }
        }
        if v.get("type").and_then(|value| value.as_str()).unwrap_or_default().is_empty()
            || v.get("name").and_then(|value| value.as_str()).unwrap_or_default().is_empty()
            || !v.get("aliases").map(|value| value.is_array()).unwrap_or(false)
            || v.get("importance").and_then(|value| value.as_str()).unwrap_or_default().is_empty()
            || !v.get("isArchived").map(|value| value.is_boolean()).unwrap_or(false)
            || v.get("createdAt").and_then(|value| value.as_i64()).is_none()
        {
            return Err("Invalid entity payload".to_string());
        }
    }

    for v in &events {
        let id = v.get("id").and_then(|value| value.as_str()).ok_or_else(|| "State event missing id".to_string())?;
        validate_id(id, "state event id")?;
        if !event_ids.insert(id.to_string()) {
            return Err("Duplicate state event id".to_string());
        }
        if let Some(row_project_id) = v.get("projectId").and_then(|value| value.as_str()) {
            if row_project_id != project_id.as_str() {
                return Err("State event projectId does not match restore project".to_string());
            }
        }
        let entity_id = v.get("entityId").and_then(|value| value.as_str()).ok_or_else(|| "State event missing entityId".to_string())?;
        if !entity_ids.contains(entity_id) {
            return Err("State event references missing entity".to_string());
        }
        if v.get("chapterNumber").and_then(|value| value.as_i64()).is_none()
            || v.get("eventType").and_then(|value| value.as_str()).unwrap_or_default().is_empty()
            || !v.get("payload").map(|value| value.is_object()).unwrap_or(false)
            || v.get("source").and_then(|value| value.as_str()).unwrap_or_default().is_empty()
        {
            return Err("Invalid state event payload".to_string());
        }
    }

    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM state_events WHERE project_id = ?1", rusqlite::params![&project_id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM entities WHERE project_id = ?1", rusqlite::params![&project_id])
        .map_err(|e| e.to_string())?;

    for v in &entities {
        let id = v["id"].as_str().unwrap_or_default().to_string();
        let entity_type = v["type"].as_str().unwrap_or_default().to_string();
        let name = v["name"].as_str().unwrap_or_default().to_string();
        let aliases = v["aliases"].to_string();
        let importance = v["importance"].as_str().unwrap_or_default().to_string();
        let category = v["category"].as_str().unwrap_or_default().to_string();
        let system_prompt = v["systemPrompt"].as_str().unwrap_or_default().to_string();
        let visual_meta = v["visualMeta"].to_string();
        let is_archived = v["isArchived"].as_bool().unwrap_or(false);
        let created_at = v["createdAt"].as_i64().unwrap_or(0);
        tx.execute(
            "INSERT OR REPLACE INTO entities (id, project_id, entity_type, name, aliases, importance, category, system_prompt, visual_meta, is_archived, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![id, &project_id, entity_type, name, aliases, importance, category, system_prompt, visual_meta, is_archived, created_at],
        )
        .map_err(|e| e.to_string())?;
    }

    for v in &events {
        let id = v["id"].as_str().unwrap_or_default().to_string();
        let chapter_number = v["chapterNumber"].as_i64().unwrap_or(0);
        let entity_id = v["entityId"].as_str().unwrap_or_default().to_string();
        let event_type = v["eventType"].as_str().unwrap_or_default().to_string();
        let payload = v["payload"].to_string();
        let source = v["source"].as_str().unwrap_or_default().to_string();
        tx.execute(
            "INSERT OR REPLACE INTO state_events (id, project_id, chapter_number, entity_id, event_type, payload, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![id, &project_id, chapter_number, entity_id, event_type, payload, source],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_entities(state: State<'_, AppState>, project_id: String) -> Result<String, String> {
    let db = lock_db!(state);
    let mut stmt = db
        .prepare("SELECT id, entity_type, name, aliases, importance, category, system_prompt, visual_meta, is_archived, created_at FROM entities WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(rusqlite::params![project_id]).map_err(|e| e.to_string())?;

    let mut entities = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).map_err(|e| e.to_string())?;
        let entity_type: String = row.get(1).map_err(|e| e.to_string())?;
        let name: String = row.get(2).map_err(|e| e.to_string())?;
        let aliases_str: String = row.get(3).map_err(|e| e.to_string())?;
        let importance: String = row.get(4).map_err(|e| e.to_string())?;
        let category: String = row.get(5).map_err(|e| e.to_string())?;
        let system_prompt: String = row.get(6).map_err(|e| e.to_string())?;
        let visual_meta_str: String = row.get(7).map_err(|e| e.to_string())?;
        let is_archived_int: i32 = row.get(8).map_err(|e| e.to_string())?;
        let created_at: i64 = row.get(9).map_err(|e| e.to_string())?;

        let visual_meta: serde_json::Value = serde_json::from_str(&visual_meta_str).unwrap_or(serde_json::Value::Null);
        let aliases: Vec<String> = serde_json::from_str(&aliases_str).unwrap_or_default();
        let is_archived = is_archived_int != 0;

        let entity = serde_json::json!({
            "id": id,
            "type": entity_type,
            "name": name,
            "aliases": aliases,
            "importance": importance,
            "category": category,
            "systemPrompt": system_prompt,
            "visualMeta": visual_meta,
            "isArchived": is_archived,
            "createdAt": created_at
        });
        entities.push(entity);
    }

    serde_json::to_string(&entities).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_state_events(state: State<'_, AppState>, project_id: String) -> Result<String, String> {
    let db = lock_db!(state);
    let mut stmt = db
        .prepare("SELECT id, chapter_number, entity_id, event_type, payload, source FROM state_events WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(rusqlite::params![project_id]).map_err(|e| e.to_string())?;

    let mut events = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).map_err(|e| e.to_string())?;
        let chapter_number: i64 = row.get(1).map_err(|e| e.to_string())?;
        let entity_id: String = row.get(2).map_err(|e| e.to_string())?;
        let event_type: String = row.get(3).map_err(|e| e.to_string())?;
        let payload_str: String = row.get(4).map_err(|e| e.to_string())?;
        let source: String = row.get(5).map_err(|e| e.to_string())?;

        let payload: serde_json::Value = serde_json::from_str(&payload_str).unwrap_or(serde_json::Value::Null);

        let event = serde_json::json!({
            "id": id,
            "chapterNumber": chapter_number,
            "entityId": entity_id,
            "eventType": event_type,
            "payload": payload,
            "source": source
        });
        events.push(event);
    }

    serde_json::to_string(&events).map_err(|e| e.to_string())
}

fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    // Get application data directory
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Create directory if it doesn't exist
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    // Use secure path for database
    let db_path = app_dir.join("ai_novel_workshop.db");

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database at {:?}: {}", db_path, e))?;

    // Enable WAL mode for better concurrency and crash safety
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to enable WAL mode: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create projects table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            data TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create chapters table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chapter_snapshots (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            data TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create chapter_snapshots table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects_meta (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create projects_meta table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS characters (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            data TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create characters table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS worldbooks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            data TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create worldbooks table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS entities (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            name TEXT NOT NULL,
            aliases TEXT NOT NULL,
            importance TEXT NOT NULL,
            category TEXT NOT NULL,
            system_prompt TEXT NOT NULL,
            visual_meta TEXT,
            is_archived INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create entities table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS state_events (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            chapter_number INTEGER NOT NULL,
            entity_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            source TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create state_events table: {}", e))?;

    // Schema migrations for existing databases missing V5 columns
    let v5_columns = [
        ("aliases", "TEXT NOT NULL DEFAULT '[]'"),
        ("importance", "TEXT NOT NULL DEFAULT 'major'"),
        ("category", "TEXT NOT NULL DEFAULT ''"),
        ("is_archived", "INTEGER NOT NULL DEFAULT 0"),
    ];
    for (col, col_type) in &v5_columns {
        // ALTER TABLE ADD COLUMN ignores if column already exists (SQLite >= 3.35.0 with IF NOT EXISTS)
        // For broader compat, we catch the "duplicate column" error silently
        let sql = format!("ALTER TABLE entities ADD COLUMN {} {}", col, col_type);
        if let Err(e) = conn.execute(&sql, []) {
            let msg = e.to_string();
            if !msg.contains("duplicate column name") {
                return Err(format!("Failed to migrate entities table: {}", e));
            }
        }
    }

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project_id)",
        [],
    )
    .map_err(|e| format!("Failed to create entities index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_state_events_project ON state_events(project_id)",
        [],
    )
    .map_err(|e| format!("Failed to create state_events index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_state_events_entity ON state_events(entity_id)",
        [],
    )
    .map_err(|e| format!("Failed to create state_events entity index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id)",
        [],
    )
    .map_err(|e| format!("Failed to create chapters index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chapters_project_id ON chapters(project_id, id)",
        [],
    )
    .map_err(|e| format!("Failed to create chapters composite index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chapter_snapshots_chapter ON chapter_snapshots(chapter_id, created_at DESC)",
        [],
    )
    .map_err(|e| format!("Failed to create chapter snapshots chapter index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chapter_snapshots_project ON chapter_snapshots(project_id)",
        [],
    )
    .map_err(|e| format!("Failed to create chapter snapshots project index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id)",
        [],
    )
    .map_err(|e| format!("Failed to create characters index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_worldbooks_project ON worldbooks(project_id)",
        [],
    )
    .map_err(|e| format!("Failed to create worldbooks index: {}", e))?;

    vector::init_vector_table(&conn)
        .map_err(|e| format!("Failed to initialize vector table: {}", e))?;

    Ok(conn)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize database with app handle
            let db = init_db(app.handle())
                .expect("Failed to initialize database");

            // Manage app state
            app.manage(AppState {
                db: Mutex::new(db),
                vector_index_cache: RwLock::new(None),
            });

            // Setup logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_project,
            save_project_with_chapters,
            save_chapter,
            reorder_chapters,
            save_chapter_snapshot,
            list_chapter_snapshots,
            get_chapter_snapshot,
            delete_chapter_snapshot,
            prune_chapter_snapshots,
            clear_project_chapters,
            load_project,
            load_project_skeleton,
            load_chapters_metadata,
            load_chapter,
            load_projects_list,
            save_projects_list,
            delete_project,
            delete_single_chapter,
            save_character_atomic,
            delete_character,
            save_worldbook_entry_atomic,
            save_worldbook_entry,
            delete_worldbook_entry,
            load_entities,
            load_state_events,
            save_entity,
            save_state_event,
            delete_entity,
            delete_state_event,
            batch_save_entities,
            batch_save_state_events,
            replace_sandbox_data,
            delete_state_events_by_range,
            vector::add_vector_documents,
            vector::delete_vector_document,
            vector::delete_vector_documents,
            vector::get_vector_document,
            vector::clear_vector_collection,
            vector::vector_search,
            vector::get_vector_document_count
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
