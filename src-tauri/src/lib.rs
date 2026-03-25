use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::State;

mod vector;

struct AppState {
    db: Mutex<Connection>,
}

#[tauri::command]
fn save_project_with_chapters(state: State<'_, AppState>, id: String, project_data: String, chapters_data: Vec<String>) -> Result<(), String> {
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction().map_err(|e| e.to_string())?;

    // 1. Save project meta
    tx.execute(
        "INSERT OR REPLACE INTO projects (id, data) VALUES (?1, ?2)",
        rusqlite::params![&id, &project_data],
    ).map_err(|e| e.to_string())?;

    // 2. Clear old chapters
    tx.execute(
        "DELETE FROM chapters WHERE project_id = ?1",
        rusqlite::params![&id],
    ).map_err(|e| e.to_string())?;

    // 3. Insert new chapters
    let mut stmt = tx.prepare("INSERT INTO chapters (id, project_id, data) VALUES (?1, ?2, ?3)").map_err(|e| e.to_string())?;
    for (i, chap_str) in chapters_data.iter().enumerate() {
        // extract chapter id if possible, otherwise use index
        let chap_id = format!("{}_chap_{}", id, i); // fallback id
        // Actually we can parse a minimal part to get id, or just require it to be passed.
        // But since we just want to save it, let's extract id from JSON string if possible.
        // A simple string search for "id":"..."
        let extracted_id = if let Some(id_idx) = chap_str.find(r#""id":""#) {
            let start = id_idx + 6;
            if let Some(end_idx) = chap_str[start..].find('"') {
                chap_str[start..start+end_idx].to_string()
            } else {
                chap_id
            }
        } else {
            chap_id
        };

        stmt.execute(rusqlite::params![extracted_id, &id, chap_str]).map_err(|e| e.to_string())?;
    }
    drop(stmt); // must drop statement before committing transaction

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_project(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO projects (id, data) VALUES (?1, ?2)",
        rusqlite::params![id, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_chapter(state: State<'_, AppState>, project_id: String, chapter_id: String, data: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO chapters (id, project_id, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![chapter_id, project_id, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn clear_project_chapters(state: State<'_, AppState>, project_id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM chapters WHERE project_id = ?1", rusqlite::params![project_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_project(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    
    // Load project metadata
    let mut stmt = db.prepare("SELECT data FROM projects WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query(rusqlite::params![id]).map_err(|e| e.to_string())?;

    let project_data: String = if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        row.get(0).map_err(|e| e.to_string())?
    } else {
        return Err("Project not found".to_string());
    };

    // Load chapters
    let mut chap_stmt = db.prepare("SELECT data FROM chapters WHERE project_id = ?1").map_err(|e| e.to_string())?;
    let mut chap_rows = chap_stmt.query(rusqlite::params![id]).map_err(|e| e.to_string())?;
    
    let mut chapters = Vec::new();
    while let Some(row) = chap_rows.next().map_err(|e| e.to_string())? {
        let chap_data: String = row.get(0).map_err(|e| e.to_string())?;
        chapters.push(chap_data);
    }

    // String concatenation instead of serde_json to avoid heavy parsing
    let mut p = project_data.trim_end().to_string();
    if p.ends_with('}') {
        p.pop(); // remove last '}'
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
fn load_projects_list(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT data FROM projects_meta").map_err(|e| e.to_string())?;
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
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO projects_meta (id, data) VALUES (1, ?1)",
        rusqlite::params![data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![&id])
        .map_err(|e| e.to_string())?;
    db.execute("DELETE FROM chapters WHERE project_id = ?1", rusqlite::params![&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn init_db() -> Connection {
    // 放在上一级目录(项目根目录)，防止触发 src-tauri 的文件热更新导致无限重启
    let conn = Connection::open("../ai_novel_workshop.db").expect("Failed to open db");
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        )",
        [],
    ).expect("Failed to create projects table");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            data TEXT NOT NULL
        )",
        [],
    ).expect("Failed to create chapters table");

    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects_meta (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )",
        [],
    ).expect("Failed to create projects_meta table");

    // Initialize vector tables
    vector::init_vector_table(&conn).expect("Failed to init vector table");

    conn
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(init_db()),
        })
        .invoke_handler(tauri::generate_handler![
            save_project,
            save_project_with_chapters,
            save_chapter,
            clear_project_chapters,
            load_project,
            load_projects_list,
            save_projects_list,
            delete_project,
            vector::add_vector_documents,
            vector::delete_vector_document,
            vector::delete_vector_documents,
            vector::get_vector_document,
            vector::clear_vector_collection,
            vector::vector_search,
            vector::get_vector_document_count
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
