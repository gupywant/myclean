use crate::safety::SafetyGuard;
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

// ---------------------------------------------------------------------------
// Phase 08 Settings & Exclusion Data Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPreferences {
    pub theme: String,               // "dark" | "light" | "system"
    pub accent_color: String,        // "violet" | "cyan" | "indigo"
    pub animation_intensity: String, // "full" | "reduced" | "off"
    pub dry_run_default: bool,
    pub move_to_trash_only: bool, // always true, cannot be disabled
    pub confirm_before_cleanup: bool,
    pub large_file_threshold_mb: u64,       // default 100
    pub low_disk_warning_threshold_gb: u64, // default 15
    pub history_retention: String,          // "30_days" | "90_days" | "180_days" | "forever"
    pub notify_scan_complete: bool,
    pub notify_clean_complete: bool,
    pub notify_clean_failure: bool,
    pub notify_low_disk_space: bool,
    pub scan_reminder_interval: String, // "off" | "daily" | "weekly" | "monthly"
    pub cpu_thread_limit: u32,          // 0 for all
    pub default_categories: Vec<String>,
    pub developer_workspaces: Vec<String>,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            accent_color: "violet".to_string(),
            animation_intensity: "full".to_string(),
            dry_run_default: false,
            move_to_trash_only: true, // immutable safety protection
            confirm_before_cleanup: true,
            large_file_threshold_mb: 100,
            low_disk_warning_threshold_gb: 15,
            history_retention: "90_days".to_string(),
            notify_scan_complete: true,
            notify_clean_complete: true,
            notify_clean_failure: true,
            notify_low_disk_space: true,
            scan_reminder_interval: "weekly".to_string(),
            cpu_thread_limit: 0,
            default_categories: vec![
                "system_caches".to_string(),
                "application_logs".to_string(),
                "developer_caches".to_string(),
                "browser_caches".to_string(),
                "mail_downloads".to_string(),
            ],
            developer_workspaces: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExclusionDescriptor {
    pub id: Option<i64>,
    pub path: String,
    pub category: String,
    pub reason: String,
    pub is_mandatory: bool,
    pub source: String, // "system", "user_identity", "custom"
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryQueryRequest {
    pub page: usize,
    pub page_size: usize,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub category: Option<String>,
    pub dry_run_only: Option<bool>,
    pub search_query: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupHistoryItem {
    pub id: i64,
    pub timestamp: String,
    pub category: String,
    pub cleanup_source: String,
    pub is_dry_run: bool,
    pub bytes_moved_to_trash: u64,
    pub estimated_reclaimable_bytes: u64,
    pub verified_host_disk_freed: Option<u64>,
    pub items_deleted: usize,
    pub items_skipped: usize,
    pub items_failed: usize,
    pub method: String,
    pub status: String, // "success" | "partial" | "failed"
    pub details_json: String,
    pub error_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryQueryResponse {
    pub items: Vec<CleanupHistoryItem>,
    pub total_count: usize,
    pub total_pages: usize,
    pub current_page: usize,
    pub total_bytes_moved_to_trash: u64,
    pub total_items_deleted: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryStorageMetric {
    pub category: String,
    pub bytes: u64,
    pub items: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyTrendMetric {
    pub date: String,
    pub bytes_moved_to_trash: u64,
    pub operations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupAnalyticsSummary {
    pub total_operations: usize,
    pub total_files_moved_to_trash: usize,
    pub total_bytes_moved_to_trash: u64,
    pub total_dry_run_operations: usize,
    pub developer_bytes_moved: u64,
    pub docker_bytes_reclaimed: u64,
    pub storage_by_category: Vec<CategoryStorageMetric>,
    pub daily_trends: Vec<DailyTrendMetric>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseHealthReport {
    pub is_healthy: bool,
    pub integrity_status: String,
    pub schema_version: u32,
    pub database_size_bytes: u64,
    pub total_cleanup_records: usize,
    pub total_scan_records: usize,
    pub total_exclusions: usize,
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

        let version: u32 = conn
            .query_row("PRAGMA user_version;", [], |row| row.get(0))
            .unwrap_or(0);

        if version < 1 {
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
        }

        if version < 2 {
            // Version 2 migration: add performance indices for fast timeline queries
            let _ = conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_cleanup_history_timestamp ON cleanup_history(timestamp DESC);",
                [],
            );
            let _ = conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_cleanup_history_id ON cleanup_history(id DESC);",
                [],
            );
            let _ = conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_scan_history_timestamp ON scan_history(timestamp DESC);",
                [],
            );
            let _ = conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_whitelist_path ON whitelist(path);",
                [],
            );

            conn.execute("PRAGMA user_version = 2;", [])?;
        }

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
        let mut stmt =
            conn.prepare("SELECT id, path, reason, added_at FROM whitelist ORDER BY id ASC;")?;
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
        let conn = match self.conn.lock() {
            Ok(c) => c,
            Err(_) => return false,
        };
        let mut stmt = match conn
            .prepare("SELECT 1 FROM whitelist WHERE ?1 = path OR ?1 LIKE (path || '/%') LIMIT 1;")
        {
            Ok(s) => s,
            Err(_) => return false,
        };
        stmt.exists(params![path_str]).unwrap_or(false)
    }

    pub fn get_all_exclusion_paths(&self) -> Vec<String> {
        let mut paths = Vec::new();
        // Mandatory paths
        for info in SafetyGuard::get_mandatory_exclusions() {
            paths.push(info.path);
        }
        // Custom paths
        if let Ok(list) = self.get_whitelist() {
            for item in list {
                paths.push(item.path);
            }
        }
        paths
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

    // -----------------------------------------------------------------------
    // Phase 08 Settings & Exclusions Methods
    // -----------------------------------------------------------------------

    pub fn get_preferences(&self) -> SqlResult<AppPreferences> {
        if let Some(json_str) = self.get_setting("app_preferences")? {
            if let Ok(mut prefs) = serde_json::from_str::<AppPreferences>(&json_str) {
                // Invariant: move_to_trash_only is always true
                prefs.move_to_trash_only = true;
                return Ok(prefs);
            }
        }
        Ok(AppPreferences::default())
    }

    pub fn update_preferences(&self, mut prefs: AppPreferences) -> SqlResult<AppPreferences> {
        // Enforce safety invariants: permanent deletion cannot be enabled
        prefs.move_to_trash_only = true;
        let serialized = serde_json::to_string(&prefs).unwrap_or_else(|_| "{}".into());
        self.set_setting("app_preferences", &serialized)?;
        Ok(prefs)
    }

    pub fn get_all_exclusions(&self) -> SqlResult<Vec<ExclusionDescriptor>> {
        let mut descriptors = Vec::new();

        // 1. Mandatory exclusions from SafetyGuard
        for item in SafetyGuard::get_mandatory_exclusions() {
            descriptors.push(ExclusionDescriptor {
                id: None,
                path: item.path,
                category: item.category,
                reason: item.explanation,
                is_mandatory: true,
                source: if item.is_system_level {
                    "system".into()
                } else {
                    "user_identity".into()
                },
                added_at: "Permanent".into(),
            });
        }

        // 2. Custom exclusions from SQLite whitelist table
        let custom_list = self.get_whitelist()?;
        for entry in custom_list {
            descriptors.push(ExclusionDescriptor {
                id: entry.id,
                path: entry.path,
                category: "Custom Exclusion".into(),
                reason: entry.reason,
                is_mandatory: false,
                source: "custom".into(),
                added_at: entry.added_at,
            });
        }

        Ok(descriptors)
    }

    pub fn add_custom_exclusion(
        &self,
        path: &str,
        reason: &str,
    ) -> Result<ExclusionDescriptor, String> {
        let target =
            SafetyGuard::validate_custom_exclusion_candidate(path).map_err(|e| e.to_string())?;

        let path_str = target.to_string_lossy().to_string();
        let final_reason = if reason.trim().is_empty() {
            "User protected directory".to_string()
        } else {
            reason.trim().to_string()
        };

        self.add_whitelist(&path_str, &final_reason)
            .map_err(|e| e.to_string())?;

        Ok(ExclusionDescriptor {
            id: None,
            path: path_str,
            category: "Custom Exclusion".into(),
            reason: final_reason,
            is_mandatory: false,
            source: "custom".into(),
            added_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    pub fn remove_custom_exclusion(&self, path: &str) -> Result<bool, String> {
        let p = Path::new(path);
        if SafetyGuard::is_mandatory_exclusion(p) {
            return Err("Cannot remove mandatory macOS system or identity exclusion".into());
        }

        self.remove_whitelist(path).map_err(|e| e.to_string())
    }

    // -----------------------------------------------------------------------
    // Phase 08 Advanced History & Analytics
    // -----------------------------------------------------------------------

    pub fn query_cleanup_history(
        &self,
        req: HistoryQueryRequest,
    ) -> SqlResult<HistoryQueryResponse> {
        let conn = self.conn.lock().unwrap();

        let mut query = "SELECT id, timestamp, bytes_freed, items_deleted, method, details_json FROM cleanup_history WHERE 1=1".to_string();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref start) = req.start_date {
            if !start.is_empty() {
                query.push_str(" AND timestamp >= ?");
                params_vec.push(Box::new(start.clone()));
            }
        }

        if let Some(ref end) = req.end_date {
            if !end.is_empty() {
                query.push_str(" AND timestamp <= ?");
                params_vec.push(Box::new(end.clone()));
            }
        }

        let sort_col = match req.sort_by.as_deref() {
            Some("bytes_freed") => "bytes_freed",
            Some("items_deleted") => "items_deleted",
            _ => "id",
        };
        let sort_dir = match req.sort_order.as_deref() {
            Some("asc") => "ASC",
            _ => "DESC",
        };
        query.push_str(&format!(" ORDER BY {} {}", sort_col, sort_dir));

        let mut stmt = conn.prepare(&query)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(CleanupRecord {
                id: Some(row.get(0)?),
                timestamp: row.get(1)?,
                bytes_freed: row.get::<_, i64>(2)? as u64,
                items_deleted: row.get::<_, i64>(3)? as usize,
                method: row.get(4)?,
                details_json: row.get(5)?,
            })
        })?;

        let mut all_items: Vec<CleanupHistoryItem> = Vec::new();
        let mut total_bytes_moved_to_trash: u64 = 0;
        let mut total_items_deleted: usize = 0;

        for r in rows {
            let record = r?;
            let val: serde_json::Value =
                serde_json::from_str(&record.details_json).unwrap_or_default();

            let is_dry_run = val
                .get("dry_run")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
                || record.method.contains("dry_run");

            if let Some(dry_filter) = req.dry_run_only {
                if dry_filter != is_dry_run {
                    continue;
                }
            }

            let has_docker_types = val
                .get("resource_types")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);
            let has_developer_provider = val.get("provider_id").and_then(|v| v.as_str()).is_some();

            let (category, source) = if record.method.contains("docker") || has_docker_types {
                ("Docker".to_string(), "Docker Studio".to_string())
            } else if record.method.contains("developer") || has_developer_provider {
                ("Developer".to_string(), "Developer Spaces".to_string())
            } else if record.method.contains("app") {
                ("Applications".to_string(), "App Uninstaller".to_string())
            } else if record.method.contains("duplicate") {
                ("Duplicates".to_string(), "Duplicate Finder".to_string())
            } else {
                ("System Cache".to_string(), "Deep Clean".to_string())
            };

            if let Some(ref cat_filter) = req.category {
                if !cat_filter.is_empty()
                    && cat_filter != "all"
                    && !category.to_lowercase().contains(&cat_filter.to_lowercase())
                {
                    continue;
                }
            }

            if let Some(ref s) = req.search_query {
                let s_lower = s.to_lowercase().trim().to_string();
                if !s_lower.is_empty() {
                    let matches_source = source.to_lowercase().contains(&s_lower);
                    let matches_cat = category.to_lowercase().contains(&s_lower);
                    let matches_details = record.details_json.to_lowercase().contains(&s_lower);
                    if !matches_source && !matches_cat && !matches_details {
                        continue;
                    }
                }
            }

            let items_skipped = val
                .get("items_skipped")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
                .unwrap_or(0);
            let items_failed = val
                .get("items_failed")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
                .or_else(|| {
                    val.get("errors")
                        .and_then(|v| v.as_array())
                        .map(|a| a.len())
                })
                .unwrap_or(0);

            let status = if items_failed > 0 && record.items_deleted == 0 {
                "failed".to_string()
            } else if items_failed > 0 {
                "partial".to_string()
            } else {
                "success".to_string()
            };

            let error_summary = val
                .get("errors")
                .and_then(|e| e.as_array())
                .and_then(|arr| arr.first())
                .and_then(|first| first.get("error_message").or_else(|| first.get("error")))
                .and_then(|msg| msg.as_str())
                .map(|s| s.to_string());

            let bytes_moved = if category == "Docker" || is_dry_run {
                0
            } else {
                record.bytes_freed
            };

            if !is_dry_run {
                total_bytes_moved_to_trash += bytes_moved;
                total_items_deleted += record.items_deleted;
            }

            all_items.push(CleanupHistoryItem {
                id: record.id.unwrap_or(0),
                timestamp: record.timestamp,
                category,
                cleanup_source: source,
                is_dry_run,
                bytes_moved_to_trash: bytes_moved,
                estimated_reclaimable_bytes: record.bytes_freed,
                verified_host_disk_freed: None,
                items_deleted: record.items_deleted,
                items_skipped,
                items_failed,
                method: record.method,
                status,
                details_json: record.details_json,
                error_summary,
            });
        }

        let total_count = all_items.len();
        let page_size = if req.page_size == 0 {
            20
        } else {
            req.page_size
        };
        let total_pages = total_count.div_ceil(page_size);
        let current_page = if req.page == 0 { 1 } else { req.page };

        let start_idx = (current_page - 1) * page_size;
        let paginated_items = if start_idx >= total_count {
            Vec::new()
        } else {
            let end_idx = (start_idx + page_size).min(total_count);
            all_items[start_idx..end_idx].to_vec()
        };

        Ok(HistoryQueryResponse {
            items: paginated_items,
            total_count,
            total_pages,
            current_page,
            total_bytes_moved_to_trash,
            total_items_deleted,
        })
    }

    pub fn get_cleanup_analytics(&self) -> SqlResult<CleanupAnalyticsSummary> {
        let history = self.get_cleanup_history(500)?;

        let mut total_operations = 0;
        let mut total_files_moved_to_trash = 0;
        let mut total_bytes_moved_to_trash = 0;
        let mut total_dry_run_operations = 0;
        let mut developer_bytes_moved = 0;
        let mut docker_bytes_reclaimed = 0;

        let mut category_map: std::collections::HashMap<String, (u64, usize)> =
            std::collections::HashMap::new();
        let mut trend_map: std::collections::BTreeMap<String, (u64, usize)> =
            std::collections::BTreeMap::new();

        for record in history {
            total_operations += 1;
            let val: serde_json::Value =
                serde_json::from_str(&record.details_json).unwrap_or_default();
            let is_dry_run = val
                .get("dry_run")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
                || record.method.contains("dry_run");

            if is_dry_run {
                total_dry_run_operations += 1;
                continue;
            }

            let has_docker_types = val
                .get("resource_types")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);
            let has_developer_provider = val.get("provider_id").and_then(|v| v.as_str()).is_some();

            let cat = if record.method.contains("docker") || has_docker_types {
                docker_bytes_reclaimed += record.bytes_freed;
                "Docker"
            } else if record.method.contains("developer") || has_developer_provider {
                developer_bytes_moved += record.bytes_freed;
                total_bytes_moved_to_trash += record.bytes_freed;
                total_files_moved_to_trash += record.items_deleted;
                "Developer"
            } else if record.method.contains("app") {
                total_bytes_moved_to_trash += record.bytes_freed;
                total_files_moved_to_trash += record.items_deleted;
                "Applications"
            } else if record.method.contains("duplicate") {
                total_bytes_moved_to_trash += record.bytes_freed;
                total_files_moved_to_trash += record.items_deleted;
                "Duplicates"
            } else {
                total_bytes_moved_to_trash += record.bytes_freed;
                total_files_moved_to_trash += record.items_deleted;
                "System Cache"
            };

            let entry = category_map.entry(cat.to_string()).or_insert((0, 0));
            entry.0 += record.bytes_freed;
            entry.1 += record.items_deleted;

            let date_key = if record.timestamp.len() >= 10 {
                record.timestamp[0..10].to_string()
            } else {
                record.timestamp.clone()
            };
            let trend = trend_map.entry(date_key).or_insert((0, 0));
            trend.0 += record.bytes_freed;
            trend.1 += 1;
        }

        let storage_by_category = category_map
            .into_iter()
            .map(|(category, (bytes, items))| CategoryStorageMetric {
                category,
                bytes,
                items,
            })
            .collect();

        let daily_trends = trend_map
            .into_iter()
            .map(
                |(date, (bytes_moved_to_trash, operations))| DailyTrendMetric {
                    date,
                    bytes_moved_to_trash,
                    operations,
                },
            )
            .collect();

        Ok(CleanupAnalyticsSummary {
            total_operations,
            total_files_moved_to_trash,
            total_bytes_moved_to_trash,
            total_dry_run_operations,
            developer_bytes_moved,
            docker_bytes_reclaimed,
            storage_by_category,
            daily_trends,
        })
    }

    pub fn check_database_integrity(&self) -> SqlResult<DatabaseHealthReport> {
        let conn = self.conn.lock().unwrap();
        let integrity_status: String = conn
            .query_row("PRAGMA integrity_check(1);", [], |row| row.get(0))
            .unwrap_or_else(|_| "error".into());
        let is_healthy = integrity_status == "ok";

        let schema_version: u32 = conn
            .query_row("PRAGMA user_version;", [], |row| row.get(0))
            .unwrap_or(0);
        let total_cleanup_records: usize = conn
            .query_row("SELECT COUNT(*) FROM cleanup_history;", [], |row| {
                row.get(0)
            })
            .unwrap_or(0);
        let total_scan_records: usize = conn
            .query_row("SELECT COUNT(*) FROM scan_history;", [], |row| row.get(0))
            .unwrap_or(0);
        let total_exclusions: usize = conn
            .query_row("SELECT COUNT(*) FROM whitelist;", [], |row| row.get(0))
            .unwrap_or(0);

        let db_path = Self::get_db_path();
        let database_size_bytes = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

        Ok(DatabaseHealthReport {
            is_healthy,
            integrity_status,
            schema_version,
            database_size_bytes,
            total_cleanup_records,
            total_scan_records,
            total_exclusions,
        })
    }

    pub fn prune_history(&self, retention_days: u64) -> SqlResult<usize> {
        if retention_days == 0 {
            return Ok(0); // 0 indicates Forever
        }
        let cutoff =
            (chrono::Utc::now() - chrono::Duration::days(retention_days as i64)).to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let count1 = conn.execute(
            "DELETE FROM cleanup_history WHERE timestamp < ?1;",
            params![cutoff],
        )?;
        let count2 = conn.execute(
            "DELETE FROM scan_history WHERE timestamp < ?1;",
            params![cutoff],
        )?;
        Ok(count1 + count2)
    }

    pub fn clear_cleanup_history(&self, confirmed: bool) -> Result<(), String> {
        if !confirmed {
            return Err("Confirmation required to clear cleanup history".into());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM cleanup_history;", [])
            .map_err(|e| e.to_string())?;
        let _ = conn.execute("VACUUM;", []);
        Ok(())
    }

    pub fn clear_scan_history(&self, confirmed: bool) -> Result<(), String> {
        if !confirmed {
            return Err("Confirmation required to clear scan history".into());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM scan_history;", [])
            .map_err(|e| e.to_string())?;
        let _ = conn.execute("VACUUM;", []);
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

        db.add_whitelist("/Users/test/Code/keep_me", "Active project")
            .unwrap();
        assert!(db.is_whitelisted("/Users/test/Code/keep_me"));
        assert!(db.is_whitelisted("/Users/test/Code/keep_me/subfolder/file.txt"));
        assert!(!db.is_whitelisted("/Users/test/Code/other"));
    }

    #[test]
    fn test_app_preferences_persistence_and_immutable_trash_safety() {
        let db = Database::in_memory().unwrap();
        let default_prefs = db.get_preferences().unwrap();
        assert_eq!(default_prefs.theme, "dark");
        assert!(default_prefs.move_to_trash_only);

        let mut custom = default_prefs.clone();
        custom.theme = "light".to_string();
        custom.accent_color = "cyan".to_string();
        custom.move_to_trash_only = false; // Attempt to disable trash safety

        let updated = db.update_preferences(custom).unwrap();
        assert_eq!(updated.theme, "light");
        assert_eq!(updated.accent_color, "cyan");
        assert!(
            updated.move_to_trash_only,
            "Trash safety MUST remain immutable"
        );

        let re_fetched = db.get_preferences().unwrap();
        assert_eq!(re_fetched.theme, "light");
        assert!(re_fetched.move_to_trash_only);
    }

    #[test]
    fn test_database_integrity_and_pruning() {
        let db = Database::in_memory().unwrap();
        let health = db.check_database_integrity().unwrap();
        assert!(health.is_healthy);
        assert_eq!(health.schema_version, 2);

        let old_time = (chrono::Utc::now() - chrono::Duration::days(120)).to_rfc3339();
        let old_rec = CleanupRecord {
            id: None,
            timestamp: old_time,
            bytes_freed: 5000,
            items_deleted: 1,
            method: "trash".into(),
            details_json: "{}".into(),
        };
        db.insert_cleanup_record(&old_rec).unwrap();

        let new_rec = CleanupRecord {
            id: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            bytes_freed: 10000,
            items_deleted: 2,
            method: "trash".into(),
            details_json: "{}".into(),
        };
        db.insert_cleanup_record(&new_rec).unwrap();

        assert_eq!(db.get_cleanup_history(10).unwrap().len(), 2);

        // Prune older than 90 days
        let pruned = db.prune_history(90).unwrap();
        assert_eq!(pruned, 1);
        assert_eq!(db.get_cleanup_history(10).unwrap().len(), 1);
    }
}
