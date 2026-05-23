/// Lock the database Mutex and return a reference to the Connection.
/// Returns an error string if the lock is poisoned.
#[macro_export]
macro_rules! lock_db {
    ($state:expr) => {
        match $state.db.lock() {
            Ok(db) => db,
            Err(e) => return Err(format!("Database lock error: {}", e)),
        }
    };
}
