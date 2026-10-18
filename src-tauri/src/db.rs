use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRecord {
    pub id: Option<i64>,
    pub timestamp: String,
    pub duration_ms: u64,
    pub total_bytes_found: u64,
    pub total_items_found: usize,
    pub category_breakdown_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupRecord {
    pub id: Option<i64>,
    pub timestamp: String,
    pub bytes_freed: u64,
    pub items_deleted: usize,
    pub method: String,
    pub details_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhitelistEntry {
    pub id: Option<i64>,
    pub path: String,
    pub reason: String,
    pub added_at: String,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Opens or initializes the SQLite database at `~/Library/Application Support/com.myclean.app/myclean.db`
    /// Safely preserves and migrates legacy data from `com.fluxcleaner.app/fluxcleaner.db`
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let db_path = Self::get_db_path();
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Safe migration from legacy database
        Self::migrate_legacy_db(&db_path);

        let conn = Connection::open(&db_path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    /// Migrates data from legacy com.fluxcleaner.app if new database does not exist yet.
    /// Preserves the legacy database intact; never deletes or silently overwrites.
    fn migrate_legacy_db(new_db_path: &Path) {
        if new_db_path.exists() {
            return;
        }

        if let Some(data_dir) = dirs::data_dir() {
            let legacy_path = data_dir.join("com.fluxcleaner.app").join("fluxcleaner.db");
            if legacy_path.exists() {
                if let Err(e) = fs::copy(&legacy_path, new_db_path) {
                    eprintln!("Notice: Legacy DB copy skipped or encountered error: {}", e);
                } else {
                    println!("Successfully migrated legacy database from com.fluxcleaner.app to com.myclean.app");
                }
            }
        }
    }

    /// In-memory database constructor for testing
    pub fn in_memory() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn get_db_path() -> PathBuf {
        if let Some(data_dir) = dirs::data_dir() {
            data_dir.join("com.myclean.app").join("myclean.db")
        } else {
            PathBuf::from("myclean.db")
        }
    }

    fn init_schema(&self) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS scan_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                total_bytes_found INTEGER NOT NULL,
                total_items_found INTEGER NOT NULL,
                category_breakdown_json TEXT NOT NULL
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS cleanup_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                bytes_freed INTEGER NOT NULL,
                items_deleted INTEGER NOT NULL,
                method TEXT NOT NULL,
                details_json TEXT NOT NULL
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS whitelist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                reason TEXT NOT NULL,
                added_at TEXT NOT NULL
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            [],
        )?;

        Ok(())
    }

    pub fn insert_scan_record(&self, record: &ScanRecord) -> SqlResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO scan_history (timestamp, duration_ms, total_bytes_found, total_items_found, category_breakdown_json)
             VALUES (?1, ?2, ?3, ?4, ?5);",
            params![
                record.timestamp,
                record.duration_ms as i64,
                record.total_bytes_found as i64,
                record.total_items_found as i64,
                record.category_breakdown_json,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_scan_history(&self, limit: usize) -> SqlResult<Vec<ScanRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, duration_ms, total_bytes_found, total_items_found, category_breakdown_json
             FROM scan_history
             ORDER BY id DESC
             LIMIT ?1;",
        )?;

        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(ScanRecord {
                id: Some(row.get(0)?),
                timestamp: row.get(1)?,
                duration_ms: row.get::<_, i64>(2)? as u64,
                total_bytes_found: row.get::<_, i64>(3)? as u64,
                total_items_found: row.get::<_, i64>(4)? as usize,
                category_breakdown_json: row.get(5)?,
            })
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    pub fn insert_cleanup_record(&self, record: &CleanupRecord) -> SqlResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO cleanup_history (timestamp, bytes_freed, items_deleted, method, details_json)
             VALUES (?1, ?2, ?3, ?4, ?5);",
            params![
                record.timestamp,
                record.bytes_freed as i64,
                record.items_deleted as i64,
                record.method,
                record.details_json,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_cleanup_history(&self, limit: usize) -> SqlResult<Vec<CleanupRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, bytes_freed, items_deleted, method, details_json
             FROM cleanup_history
             ORDER BY id DESC
             LIMIT ?1;",
        )?;

        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(CleanupRecord {
                id: Some(row.get(0)?),
                timestamp: row.get(1)?,
                bytes_freed: row.get::<_, i64>(2)? as u64,
                items_deleted: row.get::<_, i64>(3)? as usize,
                method: row.get(4)?,
                details_json: row.get(5)?,
            })
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    pub fn add_whitelist(&self, path: &str, reason: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR REPLACE INTO whitelist (path, reason, added_at) VALUES (?1, ?2, ?3);",
            params![path, reason, now],
        )?;
        Ok(())
    }

    pub fn remove_whitelist(&self, path: &str) -> SqlResult<bool> {
        let conn = self.conn.lock().unwrap();
        let count = conn.execute("DELETE FROM whitelist WHERE path = ?1;", params![path])?;
        Ok(count > 0)
    }

    pub fn get_whitelist(&self) -> SqlResult<Vec<WhitelistEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, path, reason, added_at FROM whitelist ORDER BY id ASC;")?;
        let rows = stmt.query_map([], |row| {
            Ok(WhitelistEntry {
                id: Some(row.get(0)?),
                path: row.get(1)?,
                reason: row.get(2)?,
                added_at: row.get(3)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn is_whitelisted<P: AsRef<Path>>(&self, path: P) -> bool {
        let path_str = path.as_ref().to_string_lossy().to_string();
        let conn = self.conn.lock().unwrap();
        let mut stmt = match conn.prepare("SELECT 1 FROM whitelist WHERE ?1 = path OR ?1 LIKE (path || '/%') LIMIT 1;") {
            Ok(s) => s,
            Err(_) => return false,
        };
        stmt.exists(params![path_str]).unwrap_or(false)
    }

    pub fn get_setting(&self, key: &str) -> SqlResult<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1;")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2);",
            params![key, value],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sqlite_in_memory() {
        let db = Database::in_memory().expect("Failed to create in-memory database");
        let rec = ScanRecord {
            id: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            duration_ms: 125,
            total_bytes_found: 1048576,
            total_items_found: 42,
            category_breakdown_json: "{}".into(),
        };
        let id = db.insert_scan_record(&rec).unwrap();
        assert!(id > 0);

        let history = db.get_scan_history(10).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].total_bytes_found, 1048576);

        db.add_whitelist("/Users/test/Code/keep_me", "Active project").unwrap();
        assert!(db.is_whitelisted("/Users/test/Code/keep_me"));
        assert!(db.is_whitelisted("/Users/test/Code/keep_me/subfolder/file.txt"));
        assert!(!db.is_whitelisted("/Users/test/Code/other"));
    }
}
