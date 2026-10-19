use myclean_lib::db::Database;
use myclean_lib::docker::{DockerCleanRequest, DockerManager};

#[test]
fn test_parse_docker_size_units() {
    assert_eq!(DockerManager::parse_docker_size("0B"), 0);
    assert_eq!(DockerManager::parse_docker_size("0"), 0);
    assert_eq!(DockerManager::parse_docker_size(""), 0);
    assert_eq!(DockerManager::parse_docker_size("500B"), 500);
    assert_eq!(DockerManager::parse_docker_size("10KB"), 10_000);
    assert_eq!(DockerManager::parse_docker_size("250MB"), 250_000_000);
    assert_eq!(DockerManager::parse_docker_size("1.5GB"), 1_500_000_000);
    assert_eq!(DockerManager::parse_docker_size("2TB"), 2_000_000_000_000);
    // With percentage suffix
    assert_eq!(DockerManager::parse_docker_size("1.2GB (50%)"), 1_200_000_000);
    assert_eq!(DockerManager::parse_docker_size("500MB (100%)"), 500_000_000);
}

#[test]
fn test_validate_resource_id_valid() {
    assert!(DockerManager::validate_resource_id("a1b2c3d4e5f6").is_ok());
    assert!(DockerManager::validate_resource_id("sha256:4f8e91a2b3c4").is_ok());
    assert!(DockerManager::validate_resource_id("my-test_container.v1").is_ok());
    assert!(DockerManager::validate_resource_id("docker_build_cache").is_ok());
    assert!(DockerManager::validate_resource_id("ghcr.io/owner/repo:v1.0.0").is_ok());
}

#[test]
fn test_validate_resource_id_rejects_command_injection() {
    // Semicolon
    assert!(DockerManager::validate_resource_id("img1; rm -rf /").is_err());
    // Pipe
    assert!(DockerManager::validate_resource_id("img1 | cat /etc/passwd").is_err());
    // Ampersand
    assert!(DockerManager::validate_resource_id("img1 && whoami").is_err());
    // Spaces
    assert!(DockerManager::validate_resource_id("img1 img2").is_err());
    // Newline
    assert!(DockerManager::validate_resource_id("img1\nrm -rf /").is_err());
    // Shell backticks / substitution
    assert!(DockerManager::validate_resource_id("img1`id`").is_err());
    assert!(DockerManager::validate_resource_id("img1$(id)").is_err());
    // Redirection
    assert!(DockerManager::validate_resource_id("img1 > /tmp/evil").is_err());
    assert!(DockerManager::validate_resource_id("").is_err());
}

#[test]
fn test_docker_clean_rejects_unconfirmed() {
    let db = Database::in_memory().unwrap();
    let req = DockerCleanRequest {
        resource_ids: vec!["abc123".into()],
        resource_types: vec!["stopped_container".into()],
        dry_run: false,
        confirmed: false, // Unconfirmed
    };

    let res = DockerManager::clean(req, &db);
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("Unconfirmed"));
}

#[test]
fn test_docker_clean_strictly_rejects_volume_deletion() {
    let db = Database::in_memory().unwrap();
    let req = DockerCleanRequest {
        resource_ids: vec!["my_persistent_db_vol".into()],
        resource_types: vec!["volume".into()], // Target volume
        dry_run: false,
        confirmed: true,
    };

    let res = DockerManager::clean(req, &db);
    assert!(res.is_err(), "Must reject any volume deletion attempt");
    let err = res.unwrap_err();
    assert!(
        err.contains("Docker Volume") && err.contains("protected"),
        "Expected safety error explicitly protecting volumes: {}",
        err
    );
}

#[test]
fn test_docker_status_inspection() {
    // Verifies that check_status runs safely on the host without throwing or panicking
    let status = DockerManager::check_status();
    // If CLI is present, cli_available is true; if daemon offline, daemon_running is false
    if status.cli_available && !status.daemon_running {
        assert!(status.daemon_error.is_some());
        assert!(!status.can_cleanup);
    }
}

#[test]
fn test_generic_cleaner_strictly_rejects_docker_pseudo_paths() {
    use myclean_lib::cleaner::{CleanRequest, Cleaner};
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    let db = Database::in_memory().unwrap();
    let cancel = Arc::new(AtomicBool::new(false));

    let req = CleanRequest {
        paths: vec![
            "docker://dangling-images".into(),
            "docker://build-cache".into(),
            "docker:container:bad123".into(),
        ],
        targets: None,
        method: "trash".into(),
        dry_run: false,
        confirmed: true,
    };

    let res = Cleaner::clean_items(req, &db, cancel).unwrap();
    assert!(!res.success);
    assert_eq!(res.items_deleted, 0);
    assert_eq!(res.items_failed, 3);
    for err in &res.errors {
        assert!(
            err.error_message.contains("Security Policy Violation")
                && err.error_message.contains("Docker cleanup requires dedicated scope-specific confirmation"),
            "Expected explicit Docker security policy error, got: {}",
            err.error_message
        );
    }
}

#[test]
fn test_docker_scan_items_marked_ineligible_for_generic_cleanup() {
    use myclean_lib::scanner::{RiskClassification, ScanCategory, Scanner};
    use std::path::Path;

    let (rule_id, desc, risk, eligible, inelig_reason, app) =
        Scanner::classify_candidate_rule(ScanCategory::Docker, Path::new("/dummy"));

    assert_eq!(rule_id, "RULE_DOCKER_CLUTTER");
    assert_eq!(risk, RiskClassification::ReviewRequired);
    assert!(!eligible, "Docker clutter must be ineligible for generic filesystem clean");
    assert!(inelig_reason.is_some(), "Ineligibility reason must explain Docker Studio requirement");
    assert!(
        inelig_reason.unwrap().contains("Docker Studio"),
        "Ineligibility reason must point to Docker Studio"
    );
    assert_eq!(app, Some("Docker".into()));
    assert!(!desc.is_empty());
}

