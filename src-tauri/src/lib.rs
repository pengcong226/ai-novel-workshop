use rusqlite::{Connection, Result};
use std::collections::HashSet;
use std::sync::{Mutex, RwLock};
use tauri::{Manager, State};

mod macros;
mod vector;

struct AppState {
    db: Mutex<Connection>,
    vector_index_cache: RwLock<Option<(String, String, std::sync::Arc<vector::VectorIndex>)>>,
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

    let mut stmt = tx
        .prepare("INSERT INTO chapters (id, project_id, data) VALUES (?1, ?2, ?3)")
        .map_err(|e| e.to_string())?;
    for (i, chap_str) in chapters_data.iter().enumerate() {
        let fallback_id = format!("{}_chap_{}", id, i);
        let extracted_id = extract_chapter_id(chap_str).unwrap_or(fallback_id);

        stmt.execute(rusqlite::params![extracted_id, &id, chap_str])
            .map_err(|e| e.to_string())?;
    }
    drop(stmt);

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

    let mut project_value: serde_json::Value = serde_json::from_str(&project_data)
        .map_err(|e| format!("Failed to parse project JSON: {}", e))?;

    let chapters_array: serde_json::Value = chapters
        .iter()
        .filter_map(|c| serde_json::from_str::<serde_json::Value>(c).ok())
        .collect();

    project_value["chapters"] = chapters_array;

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
    let db = lock_db!(state);
    db.execute(
        "DELETE FROM chapters WHERE project_id = ?1 AND id = ?2",
        rusqlite::params![project_id, chapter_id],
    )
    .map_err(|e| e.to_string())?;
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
