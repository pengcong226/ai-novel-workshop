use log::warn;
use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::{Manager, State};

mod vector;

struct AppState {
    db: Mutex<Connection>,
}

// Helper macro to safely lock the database
macro_rules! lock_db {
    ($state:expr) => {
        $state
            .db
            .lock()
            .map_err(|e| format!("Database lock poisoned: {}", e))?
    };
}

fn process_and_save_project_blob(db: &Connection, id: &str, data: &str) -> Result<(), String> {
    let mut v: serde_json::Value = serde_json::from_str(data).map_err(|e| e.to_string())?;

    // Migrate & isolate characters
    if let Some(chars) = v.get_mut("characters").and_then(|c| c.as_array_mut()) {
        let mut seen_ids = Vec::new();
        for ch in chars.iter() {
            if let Some(ch_id) = ch.get("id").and_then(|id| id.as_str()) {
                seen_ids.push(ch_id.to_string());
                db.execute(
                    "INSERT OR REPLACE INTO characters (id, project_id, data) VALUES (?1, ?2, ?3)",
                    rusqlite::params![ch_id, id, ch.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Sync deletions
        if let Ok(mut stmt) = db.prepare("SELECT id FROM characters WHERE project_id = ?1") {
            if let Ok(rows) = stmt.query_map(rusqlite::params![id], |row| row.get::<_, String>(0)) {
                for ext_id in rows.filter_map(Result::ok) {
                    if !seen_ids.contains(&ext_id) {
                        if let Err(e) = db.execute(
                            "DELETE FROM characters WHERE project_id = ?1 AND id = ?2",
                            rusqlite::params![id, ext_id],
                        ) {
                            warn!(
                                "Failed to delete orphaned character {} in project {}: {}",
                                ext_id, id, e
                            );
                        }
                    }
                }
            }
        }

        // Strip them from main blob
        v["characters"] = serde_json::json!([]);
    }

    // Migrate & isolate worldbook entries
    if let Some(wb) = v.get_mut("worldbook").and_then(|w| w.as_object_mut()) {
        if let Some(entries) = wb.get_mut("entries").and_then(|e| e.as_array_mut()) {
            let mut seen_ids = Vec::new();
            for entry in entries.iter() {
                if let Some(entry_id) = entry.get("id").and_then(|id| id.as_str()) {
                    seen_ids.push(entry_id.to_string());
                    db.execute(
                        "INSERT OR REPLACE INTO worldbooks (id, project_id, data) VALUES (?1, ?2, ?3)",
                        rusqlite::params![entry_id, id, entry.to_string()],
                    ).map_err(|e| e.to_string())?;
                }
            }

            // Sync deletions for worldbook entries
            if let Ok(mut stmt) = db.prepare("SELECT id FROM worldbooks WHERE project_id = ?1") {
                if let Ok(rows) =
                    stmt.query_map(rusqlite::params![id], |row| row.get::<_, String>(0))
                {
                    for ext_id in rows.filter_map(Result::ok) {
                        if !seen_ids.contains(&ext_id) {
                            if let Err(e) = db.execute(
                                "DELETE FROM worldbooks WHERE project_id = ?1 AND id = ?2",
                                rusqlite::params![id, ext_id],
                            ) {
                                warn!("Failed to delete orphaned worldbook entry {} in project {}: {}", ext_id, id, e);
                            }
                        }
                    }
                }
            }

            // Strip them
            wb.insert("entries".to_string(), serde_json::json!([]));
        }
    }

    let stripped_data = serde_json::to_string(&v).map_err(|e| e.to_string())?;

    db.execute(
        "INSERT OR REPLACE INTO projects (id, data) VALUES (?1, ?2)",
        rusqlite::params![id, stripped_data],
    )
    .map_err(|e| e.to_string())?;

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

#[tauri::command]
fn save_project_with_chapters(
    state: State<'_, AppState>,
    id: String,
    project_data: String,
    chapters_data: Vec<String>,
) -> Result<(), String> {
    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;

    // 1. Process and save project meta (this strips arrays and inserts to sub-tables)
    process_and_save_project_blob(&tx, &id, &project_data)?;

    // 2. Clear old chapters
    tx.execute(
        "DELETE FROM chapters WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;

    // 3. Insert new chapters
    let mut stmt = tx
        .prepare("INSERT INTO chapters (id, project_id, data) VALUES (?1, ?2, ?3)")
        .map_err(|e| e.to_string())?;
    for (i, chap_str) in chapters_data.iter().enumerate() {
        let chap_id = format!("{}_chap_{}", id, i);
        let extracted_id = if let Some(id_idx) = chap_str.find(r#""id":""#) {
            let start = id_idx + 6;
            if let Some(end_idx) = chap_str[start..].find('"') {
                chap_str[start..start + end_idx].to_string()
            } else {
                chap_id
            }
        } else {
            chap_id
        };

        stmt.execute(rusqlite::params![extracted_id, &id, chap_str])
            .map_err(|e| e.to_string())?;
    }
    drop(stmt);

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_project(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    let mut db = lock_db!(state);
    let tx = db.transaction().map_err(|e| e.to_string())?;

    process_and_save_project_blob(&tx, &id, &data)?;

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
    let db = lock_db!(state);
    db.execute(
        "INSERT OR REPLACE INTO chapters (id, project_id, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![chapter_id, project_id, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn clear_project_chapters(state: State<'_, AppState>, project_id: String) -> Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "DELETE FROM chapters WHERE project_id = ?1",
        rusqlite::params![project_id],
    )
    .map_err(|e| e.to_string())?;
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
        chapters.push(chap_data);
    }

    let mut p = project_data.trim_end().to_string();
    if p.ends_with('}') {
        p.pop();
        let chapters_json = format!("\"chapters\":[{}]", chapters.join(","));

        let final_json = if p.ends_with('{') {
            format!("{}{}}}", p, chapters_json)
        } else {
            format!("{},{}}}", p, chapters_json)
        };
        return Ok(final_json);
    }

    Ok(project_data)
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
            if let Ok(stripped) = serde_json::to_string(&v) {
                chapters.push(stripped);
            }
        }
    }

    Ok(format!("[{}]", chapters.join(",")))
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
    let db = lock_db!(state);
    db.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![&id])
        .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM chapters WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM characters WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM worldbooks WHERE project_id = ?1",
        rusqlite::params![&id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_single_chapter(
    state: State<'_, AppState>,
    project_id: String,
    chapter_id: String,
) -> Result<(), String> {
    let db = lock_db!(state);
    db.execute(
        "DELETE FROM chapters WHERE project_id = ?1 AND id = ?2",
        rusqlite::params![project_id, chapter_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_character(
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
    // For V5, we just store the JSON dump directly into the `entities` table for now
    // or parse it to insert into columns if strictly needed.
    // Based on the SQL schema we created: id, project_id, entity_type, name, category, system_prompt, visual_meta, created_at
    let mut v: serde_json::Value = serde_json::from_str(&entity_json).map_err(|e| e.to_string())?;
    let id = v["id"].as_str().unwrap_or_default().to_string();
    let entity_type = v["type"].as_str().unwrap_or_default().to_string();
    let name = v["name"].as_str().unwrap_or_default().to_string();
    let category = v["category"].as_str().unwrap_or_default().to_string();
    let system_prompt = v["systemPrompt"].as_str().unwrap_or_default().to_string();
    let visual_meta = v["visualMeta"].to_string();
    let created_at = v["createdAt"].as_i64().unwrap_or(0);

    let db = lock_db!(state);
    db.execute(
        "INSERT OR REPLACE INTO entities (id, project_id, entity_type, name, category, system_prompt, visual_meta, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, project_id, entity_type, name, category, system_prompt, visual_meta, created_at],
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
    let mut v: serde_json::Value = serde_json::from_str(&event_json).map_err(|e| e.to_string())?;
    let id = v["id"].as_str().unwrap_or_default().to_string();
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
            category TEXT,
            system_prompt TEXT,
            visual_meta TEXT,
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
            clear_project_chapters,
            load_project,
            load_project_skeleton,
            load_chapters_metadata,
            load_chapter,
            load_projects_list,
            save_projects_list,
            delete_project,
            delete_single_chapter,
            save_character,
            delete_character,
            save_worldbook_entry,
            delete_worldbook_entry,
            save_entity,
            save_state_event,
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
