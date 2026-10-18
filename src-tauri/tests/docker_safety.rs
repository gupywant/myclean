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
