use myclean_lib::apps::{AppInspector, CleanOrphanedRequest, UninstallAppRequest};
use myclean_lib::db::Database;
use std::fs;

#[test]
fn test_app_bundle_malformed_plist_and_fallback() {
    let temp = std::env::temp_dir().join(format!(
        "myclean_test_malformed_plist_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let bundle = temp.join("MalformedApp.app");
    let contents = bundle.join("Contents");
    fs::create_dir_all(&contents).unwrap();

    // Write malformed Info.plist (invalid XML/binary)
    fs::write(contents.join("Info.plist"), b"corrupted non-plist data").unwrap();

    let app = AppInspector::inspect_app_bundle(&bundle)
        .expect("Should gracefully handle malformed plist with fallback name");
    assert_eq!(app.name, "MalformedApp");
    assert_eq!(app.bundle_id, "MalformedApp");
    assert_eq!(app.version, "1.0");

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_app_bundle_missing_bundle_id() {
    let temp = std::env::temp_dir().join(format!(
        "myclean_test_missing_bid_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let bundle = temp.join("NoBidApp.app");
    let contents = bundle.join("Contents");
    fs::create_dir_all(&contents).unwrap();

    // Plist with name and version, but missing CFBundleIdentifier
    fs::write(
        contents.join("Info.plist"),
        r#"<?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0">
        <dict>
            <key>CFBundleName</key>
            <string>CustomApp</string>
            <key>CFBundleShortVersionString</key>
            <string>2.1.0</string>
        </dict>
        </plist>"#,
    )
    .unwrap();

    let app = AppInspector::inspect_app_bundle(&bundle).expect("Must inspect bundle");
    assert_eq!(app.name, "CustomApp");
    assert_eq!(app.bundle_id, "NoBidApp"); // Fallbacks to folder stem
    assert_eq!(app.version, "2.1.0");

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_app_uninstall_rejects_system_application() {
    let db = Database::in_memory().unwrap();

    let sys_app = "/System/Applications/Calculator.app";
    let req = UninstallAppRequest {
        app_path: sys_app.to_string(),
        bundle_id: "com.apple.calculator".to_string(),
        paths_to_delete: vec![sys_app.to_string()],
        dry_run: false,
        confirmed: true,
    };

    let res = AppInspector::uninstall_application(req, &db);
    assert!(res.is_err(), "Must reject system protected application");
    assert!(res
        .unwrap_err()
        .contains("Protected macOS system applications"));
}

#[test]
fn test_app_uninstall_rejects_unconfirmed() {
    let db = Database::in_memory().unwrap();

    let req = UninstallAppRequest {
        app_path: "/Applications/Dummy.app".to_string(),
        bundle_id: "com.example.dummy".to_string(),
        paths_to_delete: vec!["/Applications/Dummy.app".to_string()],
        dry_run: false,
        confirmed: false, // Unconfirmed
    };

    let res = AppInspector::uninstall_application(req, &db);
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("Unconfirmed"));
}

#[test]
fn test_app_uninstall_rejects_user_document_targets() {
    let db = Database::in_memory().unwrap();
    let home = dirs::home_dir().unwrap();

    let temp = std::env::temp_dir().join(format!(
        "myclean_test_doc_target_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let bundle = temp.join("Fake.app");
    fs::create_dir_all(bundle.join("Contents")).unwrap();

    // Target includes ~/Documents/report.pdf
    let forbidden_target = home.join("Documents/tax_return.pdf");

    let req = UninstallAppRequest {
        app_path: bundle.to_string_lossy().to_string(),
        bundle_id: "com.example.fake".to_string(),
        paths_to_delete: vec![
            bundle.to_string_lossy().to_string(),
            forbidden_target.to_string_lossy().to_string(),
        ],
        dry_run: true,
        confirmed: true,
    };

    let res = AppInspector::uninstall_application(req, &db);
    assert!(
        res.is_err(),
        "Must reject targeting user documents during uninstall"
    );

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_app_uninstall_dry_run_workflow() {
    let db = Database::in_memory().unwrap();

    let temp = std::env::temp_dir().join(format!(
        "myclean_test_uninstall_dry_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let bundle = temp.join("TestDry.app");
    let contents = bundle.join("Contents");
    fs::create_dir_all(&contents).unwrap();
    fs::write(contents.join("Info.plist"), b"<plist></plist>").unwrap();

    let req = UninstallAppRequest {
        app_path: bundle.to_string_lossy().to_string(),
        bundle_id: "com.example.testdry".to_string(),
        paths_to_delete: vec![bundle.to_string_lossy().to_string()],
        dry_run: true, // DRY RUN
        confirmed: true,
    };

    let res = AppInspector::uninstall_application(req, &db).expect("Dry run should succeed");
    assert!(res.dry_run);
    assert_eq!(res.items_deleted, 1);
    assert_eq!(res.bytes_moved_to_trash, 0);
    assert!(bundle.exists(), "Dry run must NOT delete files");

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_clean_orphaned_data_safety_rejections() {
    let db = Database::in_memory().unwrap();

    // Test unconfirmed request
    let unconf_req = CleanOrphanedRequest {
        paths: vec!["/some/path".to_string()],
        dry_run: false,
        confirmed: false,
    };
    assert!(AppInspector::clean_orphaned_data(unconf_req, &db).is_err());

    // Test targeting system protected path
    let sys_req = CleanOrphanedRequest {
        paths: vec!["/System/Library/Caches".to_string()],
        dry_run: false,
        confirmed: true,
    };
    assert!(AppInspector::clean_orphaned_data(sys_req, &db).is_err());

    // Test targeting user documents
    let home = dirs::home_dir().unwrap();
    let doc_req = CleanOrphanedRequest {
        paths: vec![home.join("Documents/file.txt").to_string_lossy().to_string()],
        dry_run: false,
        confirmed: true,
    };
    assert!(AppInspector::clean_orphaned_data(doc_req, &db).is_err());
}
