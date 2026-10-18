use myclean_lib::db::Database;
use myclean_lib::developer::{
    CargoCacheProvider, DeveloperCleanRequest, DeveloperEngine, DeveloperProvider,
    GradleCacheProvider, NpmCacheProvider, WorkspaceArtifactsProvider, XcodeDerivedDataProvider,
};
use myclean_lib::safety::SafetyError;
use std::fs;
use std::sync::atomic::AtomicBool;

#[test]
fn test_xcode_provider_rejects_paths_outside_derived_data() {
    let provider = XcodeDerivedDataProvider;
    let home = dirs::home_dir().unwrap();

    // Target a personal document or arbitrary file
    let fake_target = home.join("Documents/MyProject").to_string_lossy().to_string();
    let res = provider.validate(&[fake_target]);
    assert!(res.is_err(), "Must reject path outside DerivedData");
    match res.unwrap_err() {
        SafetyError::SymlinkEscape(msg) => {
            assert!(msg.contains("outside Xcode DerivedData"));
        }
        _ => panic!("Expected SymlinkEscape / boundary violation error"),
    }
}

#[test]
fn test_cargo_provider_protects_bin_and_credentials() {
    let provider = CargoCacheProvider;
    let home = dirs::home_dir().unwrap();
    let cargo_root = home.join(".cargo");
    let _ = fs::create_dir_all(&cargo_root);

    // 1. Target .cargo/bin
    let bin_path = cargo_root.join("bin");
    let res1 = provider.validate(&[bin_path.to_string_lossy().to_string()]);
    assert!(res1.is_err(), "Must protect .cargo/bin");

    // 2. Target .cargo/config.toml
    let config_path = cargo_root.join("config.toml");
    let _ = fs::write(&config_path, "# test config");
    let res2 = provider.validate(&[config_path.to_string_lossy().to_string()]);
    assert!(res2.is_err(), "Must protect .cargo/config.toml");

    // 3. Target root .cargo
    let res3 = provider.validate(&[cargo_root.to_string_lossy().to_string()]);
    assert!(res3.is_err(), "Must protect root .cargo directory");
}

#[test]
fn test_gradle_provider_protects_wrapper_and_properties() {
    let provider = GradleCacheProvider;
    let home = dirs::home_dir().unwrap();
    let gradle_root = home.join(".gradle");
    let _ = fs::create_dir_all(gradle_root.join("wrapper"));

    let wrapper_path = gradle_root.join("wrapper");
    let res = provider.validate(&[wrapper_path.to_string_lossy().to_string()]);
    assert!(res.is_err(), "Must protect .gradle/wrapper");
}

#[test]
fn test_npm_provider_restricts_to_cacache() {
    let provider = NpmCacheProvider;
    let home = dirs::home_dir().unwrap();
    let npm_root = home.join(".npm");
    let _ = fs::create_dir_all(&npm_root);

    // Target arbitrary file in .npm, e.g. .npm/anonymous-cli-metrics.json
    let metrics_path = npm_root.join("anonymous-cli-metrics.json");
    let _ = fs::write(&metrics_path, "{}");
    let res = provider.validate(&[metrics_path.to_string_lossy().to_string()]);
    assert!(res.is_err(), "Must restrict npm provider strictly to _cacache");
}

#[test]
fn test_workspace_target_requires_cargo_toml_manifest() {
    let temp = std::env::temp_dir().join(format!(
        "myclean_test_ws_target_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let target_dir = temp.join("target");
    fs::create_dir_all(&target_dir).unwrap();

    // Without Cargo.toml, verification must fail
    let res = WorkspaceArtifactsProvider::verify_workspace_artifact(&target_dir);
    assert!(res.is_err(), "Folder named target without Cargo.toml must be rejected");
    if let Err(SafetyError::UserProtected(msg)) = res {
        assert!(msg.contains("Cargo.toml"));
    } else {
        panic!("Expected UserProtected error referencing missing Cargo.toml");
    }

    // Now add Cargo.toml
    fs::write(temp.join("Cargo.toml"), "[package]\nname = \"dummy\"\n").unwrap();
    let res_ok = WorkspaceArtifactsProvider::verify_workspace_artifact(&target_dir);
    assert!(res_ok.is_ok(), "With Cargo.toml, target/ must be verified successfully");

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_workspace_node_modules_requires_package_json_manifest() {
    let temp = std::env::temp_dir().join(format!(
        "myclean_test_ws_node_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let nm_dir = temp.join("node_modules");
    fs::create_dir_all(&nm_dir).unwrap();

    // Without package.json, verification must fail
    let res = WorkspaceArtifactsProvider::verify_workspace_artifact(&nm_dir);
    assert!(res.is_err(), "Folder named node_modules without package.json must be rejected");
    if let Err(SafetyError::UserProtected(msg)) = res {
        assert!(msg.contains("package.json"));
    } else {
        panic!("Expected UserProtected error referencing missing package.json");
    }

    // Now add package.json
    fs::write(temp.join("package.json"), "{\"name\":\"dummy\"}").unwrap();
    let res_ok = WorkspaceArtifactsProvider::verify_workspace_artifact(&nm_dir);
    assert!(res_ok.is_ok(), "With package.json, node_modules/ must be verified successfully");

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_developer_clean_rejects_unconfirmed() {
    let db = Database::in_memory().unwrap();
    let req = DeveloperCleanRequest {
        paths: vec!["/some/random/path".into()],
        dry_run: false,
        confirmed: false, // Unconfirmed
    };

    let res = DeveloperEngine::clean_artifacts(req, None, &db);
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("Unconfirmed"));
}

#[test]
fn test_developer_dry_run_preserves_files() {
    let db = Database::in_memory().unwrap();
    let temp = std::env::temp_dir().join(format!(
        "myclean_test_dev_dry_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let target_dir = temp.join("target");
    fs::create_dir_all(&target_dir).unwrap();
    fs::write(temp.join("Cargo.toml"), "[package]\nname = \"dummy\"\n").unwrap();
    fs::write(target_dir.join("dummy.bin"), b"binary bytes here").unwrap();

    let req = DeveloperCleanRequest {
        paths: vec![target_dir.to_string_lossy().to_string()],
        dry_run: true, // DRY RUN
        confirmed: true,
    };

    let ws = Some(vec![temp.to_string_lossy().to_string()]);
    let res = DeveloperEngine::clean_artifacts(req, ws, &db).expect("Dry run should succeed");
    assert!(res.dry_run);
    assert_eq!(res.items_deleted, 1);
    assert_eq!(res.bytes_moved_to_trash, 0);
    assert!(target_dir.exists(), "Dry run must NOT delete files");

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_developer_scan_cancellation() {
    let cancel = AtomicBool::new(true); // Pre-cancelled
    let res = DeveloperEngine::scan_all(None, &cancel).expect("Scan should complete quickly");
    assert!(res.items.is_empty(), "Cancelled scan should abort traversal");
}
