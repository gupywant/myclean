use myclean_lib::db::{CleanupRecord, Database, HistoryQueryRequest};
use myclean_lib::notifications::NotificationManager;

#[test]
fn test_settings_persistence_and_defaults() {
    let db = Database::in_memory().expect("Failed to initialize in-memory DB");
    let prefs = db.get_preferences().expect("Failed to get preferences");

    // Verify defaults
    assert_eq!(prefs.theme, "dark");
    assert_eq!(prefs.accent_color, "violet");
    assert_eq!(prefs.animation_intensity, "full");
    assert_eq!(prefs.large_file_threshold_mb, 100);
    assert_eq!(prefs.low_disk_warning_threshold_gb, 15);
    assert_eq!(prefs.history_retention, "90_days");
    assert!(prefs.move_to_trash_only);
    assert!(prefs.confirm_before_cleanup);
    assert!(!prefs.dry_run_default);

    // Update preferences
    let mut modified = prefs.clone();
    modified.theme = "system".to_string();
    modified.accent_color = "cyan".to_string();
    modified.animation_intensity = "reduced".to_string();
    modified.large_file_threshold_mb = 250;
    modified.developer_workspaces = vec!["/Users/test/Code/proj1".into()];

    let saved = db.update_preferences(modified).expect("Failed to save prefs");
    assert_eq!(saved.theme, "system");
    assert_eq!(saved.accent_color, "cyan");
    assert_eq!(saved.large_file_threshold_mb, 250);

    // Re-read from database
    let fetched = db.get_preferences().expect("Failed to re-fetch prefs");
    assert_eq!(fetched.theme, "system");
    assert_eq!(fetched.accent_color, "cyan");
    assert_eq!(fetched.animation_intensity, "reduced");
    assert_eq!(fetched.large_file_threshold_mb, 250);
    assert_eq!(fetched.developer_workspaces.len(), 1);
}

#[test]
fn test_protected_safety_settings_immutability() {
    let db = Database::in_memory().expect("Failed to initialize in-memory DB");
    let mut malicious_prefs = db.get_preferences().unwrap();

    // Malicious request attempts to disable move_to_trash_only
    malicious_prefs.move_to_trash_only = false;

    let updated = db.update_preferences(malicious_prefs).unwrap();
    assert!(
        updated.move_to_trash_only,
        "Rust backend MUST forcibly preserve move_to_trash_only = true"
    );

    let re_read = db.get_preferences().unwrap();
    assert!(
        re_read.move_to_trash_only,
        "Persisted preferences MUST have move_to_trash_only = true"
    );
}

#[test]
fn test_mandatory_exclusion_immutability() {
    let db = Database::in_memory().expect("Failed to initialize in-memory DB");

    // Attempting to remove macOS SIP root
    let remove_sys = db.remove_custom_exclusion("/System");
    assert!(remove_sys.is_err(), "Mandatory /System must be non-removable");
    assert!(remove_sys.unwrap_err().contains("Cannot remove mandatory"));

    // Attempting to remove personal Documents
    if let Some(home) = dirs::home_dir() {
        let docs = home.join("Documents").to_string_lossy().to_string();
        let remove_docs = db.remove_custom_exclusion(&docs);
        assert!(remove_docs.is_err(), "Mandatory Documents must be non-removable");
    }
}

#[test]
fn test_custom_exclusion_validation_and_rejections() {
    let db = Database::in_memory().expect("Failed to initialize in-memory DB");

    // Empty path rejection
    let empty_res = db.add_custom_exclusion("   ", "Empty");
    assert!(empty_res.is_err());

    // Path traversal rejection
    let traversal_res = db.add_custom_exclusion("/Users/user/../../System", "Traversal");
    assert!(traversal_res.is_err());

    // Root path rejection
    let root_res = db.add_custom_exclusion("/", "Root");
    assert!(root_res.is_err());

    // Valid path addition
    let valid_path = "/Users/test/Workspace/my-safe-app";
    let add_res = db.add_custom_exclusion(valid_path, "Client confidential repo");
    assert!(add_res.is_ok());

    let all = db.get_all_exclusions().unwrap();
    let found = all.iter().find(|e| e.path == valid_path);
    assert!(found.is_some());
    assert_eq!(found.unwrap().reason, "Client confidential repo");
    assert!(!found.unwrap().is_mandatory);

    // Whitelist query must report true
    assert!(db.is_whitelisted(valid_path));
    assert!(db.is_whitelisted(format!("{}/child/file.rs", valid_path)));

    // Removal of custom exclusion
    let rem_res = db.remove_custom_exclusion(valid_path);
    assert!(rem_res.is_ok());
    assert!(!db.is_whitelisted(valid_path));
}

#[test]
fn test_history_pagination_filtering_and_accuracy() {
    let db = Database::in_memory().expect("Failed to initialize in-memory DB");

    // Insert 5 test cleanup records across different sources
    for i in 1..=5 {
        let rec = CleanupRecord {
            id: None,
            timestamp: format!("2026-10-1{:02}T12:00:00Z", i),
            bytes_freed: (i as u64) * 10_000_000,
            items_deleted: i * 5,
            method: if i == 1 { "dry_run".into() } else if i == 2 { "docker".into() } else { "trash".into() },
            details_json: serde_json::json!({
                "dry_run": i == 1,
                "items_deleted": i * 5,
                "items_skipped": 0,
                "items_failed": 0,
                "provider_id": if i == 3 { Some("xcode_derived_data") } else { None },
                "resource_types": if i == 2 { Some(vec!["dangling_image"]) } else { None },
            }).to_string(),
        };
        db.insert_cleanup_record(&rec).unwrap();
    }

    // Query page 1 with page size 2
    let req1 = HistoryQueryRequest {
        page: 1,
        page_size: 2,
        start_date: None,
        end_date: None,
        category: None,
        dry_run_only: None,
        search_query: None,
        sort_by: Some("id".into()),
        sort_order: Some("desc".into()),
    };
    let res1 = db.query_cleanup_history(req1).unwrap();
    assert_eq!(res1.total_count, 5);
    assert_eq!(res1.total_pages, 3);
    assert_eq!(res1.items.len(), 2);
    assert_eq!(res1.current_page, 1);

    // Filter by dry_run_only = true
    let req_dry = HistoryQueryRequest {
        page: 1,
        page_size: 10,
        start_date: None,
        end_date: None,
        category: None,
        dry_run_only: Some(true),
        search_query: None,
        sort_by: None,
        sort_order: None,
    };
    let res_dry = db.query_cleanup_history(req_dry).unwrap();
    assert_eq!(res_dry.total_count, 1);
    assert!(res_dry.items[0].is_dry_run);

    // Filter by category = "Docker"
    let req_docker = HistoryQueryRequest {
        page: 1,
        page_size: 10,
        start_date: None,
        end_date: None,
        category: Some("Docker".into()),
        dry_run_only: None,
        search_query: None,
        sort_by: None,
        sort_order: None,
    };
    let res_docker = db.query_cleanup_history(req_docker).unwrap();
    assert_eq!(res_docker.total_count, 1);
    assert_eq!(res_docker.items[0].category, "Docker");
}

#[test]
fn test_cleanup_analytics_aggregation() {
    let db = Database::in_memory().expect("Failed to initialize in-memory DB");

    // Add standard cache clean
    let rec1 = CleanupRecord {
        id: None,
        timestamp: "2026-10-18T10:00:00Z".into(),
        bytes_freed: 15_000_000,
        items_deleted: 10,
        method: "trash".into(),
        details_json: r#"{"dry_run": false}"#.into(),
    };
    db.insert_cleanup_record(&rec1).unwrap();

    // Add docker clean
    let rec2 = CleanupRecord {
        id: None,
        timestamp: "2026-10-18T11:00:00Z".into(),
        bytes_freed: 50_000_000,
        items_deleted: 2,
        method: "docker".into(),
        details_json: r#"{"dry_run": false, "resource_types": ["unused_image"]}"#.into(),
    };
    db.insert_cleanup_record(&rec2).unwrap();

    let analytics = db.get_cleanup_analytics().unwrap();
    assert_eq!(analytics.total_operations, 2);
    // Crucial Invariant: Docker bytes are reported in docker_bytes_reclaimed, not bytes_moved_to_trash!
    assert_eq!(analytics.docker_bytes_reclaimed, 50_000_000);
    assert_eq!(analytics.total_bytes_moved_to_trash, 15_000_000);
    assert_eq!(analytics.total_files_moved_to_trash, 10);
}

#[test]
fn test_database_health_and_clear_history() {
    let db = Database::in_memory().expect("Failed to initialize in-memory DB");
    let report = db.check_database_integrity().unwrap();
    assert!(report.is_healthy);
    assert_eq!(report.integrity_status, "ok");
    assert_eq!(report.schema_version, 2);

    // Unconfirmed clear attempt rejected
    assert!(db.clear_cleanup_history(false).is_err());
    assert!(db.clear_scan_history(false).is_err());

    // Confirmed clear succeeds
    assert!(db.clear_cleanup_history(true).is_ok());
    assert!(db.clear_scan_history(true).is_ok());
}

#[test]
fn test_notifications_robustness() {
    // Should execute safely without panic
    let res = NotificationManager::send(
        "myclean Unit Test",
        Some("Safety Check"),
        "Testing notification delivery subsystem.",
    );
    assert!(res.is_ok());
}
