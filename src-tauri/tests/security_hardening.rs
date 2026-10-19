use myclean_lib::cleaner::{CleanRequest, Cleaner};
use myclean_lib::commands::open_in_finder;
use myclean_lib::db::Database;
use myclean_lib::docker::{DockerCleanRequest, DockerManager};
use myclean_lib::safety::{SafetyError, SafetyGuard};
use myclean_lib::scanner::Scanner;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Instant;

fn create_temp_test_dir(prefix: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let temp = std::env::temp_dir().join(format!("myclean_sec_{}_{}", prefix, nanos));
    let _ = fs::remove_dir_all(&temp);
    fs::create_dir_all(&temp).unwrap();
    temp
}

#[test]
fn test_toctou_symlink_substitution_rejection() {
    let temp = create_temp_test_dir("symlink_swap");

    let legitimate_file = temp.join("disposable_cache.tmp");
    fs::write(&legitimate_file, b"disposable cache payload").unwrap();

    // 1. Capture legitimate snapshot during simulated scan
    let snapshot =
        SafetyGuard::capture_snapshot(&legitimate_file).expect("Failed to capture snapshot");
    assert!(!snapshot.is_symlink);
    assert!(snapshot.is_file);

    // 2. Sensitive target outside temp dir
    let sensitive_file = temp.join("protected_secret.key");
    fs::write(&sensitive_file, b"CRITICAL_PRIVATE_KEY").unwrap();

    // 3. Attack simulation: Replace disposable file with a symlink pointing to sensitive target
    fs::remove_file(&legitimate_file).unwrap();
    std::os::unix::fs::symlink(&sensitive_file, &legitimate_file).unwrap();

    // 4. Verify unaltered recheck catches the symlink substitution
    let verify_res = SafetyGuard::verify_unaltered(&legitimate_file, &snapshot);
    assert!(
        verify_res.is_err(),
        "Expected verify_unaltered to reject symlink substitution, but it succeeded!"
    );

    let err = verify_res.unwrap_err();
    let err_str = err.to_string();
    assert!(
        err_str.contains("TOCTOU") || err_str.contains("symlink") || err_str.contains("inode"),
        "Unexpected error: {}",
        err_str
    );

    // Ensure the sensitive target remains completely untouched
    assert!(sensitive_file.exists());
    let secret_content = fs::read(&sensitive_file).unwrap();
    assert_eq!(secret_content, b"CRITICAL_PRIVATE_KEY");

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_toctou_inode_replacement_rejection() {
    let temp = create_temp_test_dir("inode_swap");

    let target_file = temp.join("cache.dat");
    fs::write(&target_file, b"original content").unwrap();

    let snapshot = SafetyGuard::capture_snapshot(&target_file).expect("Failed to capture snapshot");

    // Manually forge a snapshot with a different inode
    let mut altered_snapshot = snapshot.clone();
    altered_snapshot.ino = snapshot.ino.wrapping_add(9999);

    let verify_res = SafetyGuard::verify_unaltered(&target_file, &altered_snapshot);
    assert!(verify_res.is_err());
    assert!(matches!(
        verify_res.unwrap_err(),
        SafetyError::SecurityViolation(_)
    ));

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_toctou_file_type_mutation_rejection() {
    let temp = create_temp_test_dir("type_mutation");

    let target = temp.join("item_to_mutate");
    fs::write(&target, b"regular file content").unwrap();

    let snapshot = SafetyGuard::capture_snapshot(&target).expect("Snapshot capture failed");
    assert!(snapshot.is_file);
    assert!(!snapshot.is_dir);

    // Attack simulation: Delete file and create directory with the same name
    fs::remove_file(&target).unwrap();
    fs::create_dir(&target).unwrap();

    let verify_res = SafetyGuard::verify_unaltered(&target, &snapshot);
    assert!(verify_res.is_err());
    let err_msg = verify_res.unwrap_err().to_string();
    assert!(err_msg.contains("TOCTOU"), "Error was: {}", err_msg);

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_ipc_open_in_finder_traversal_and_injection() {
    // 1. Directory traversal attempt
    let res = open_in_finder("../../etc/passwd".into());
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("Path traversal"));

    // 2. Command-line flag injection attempt
    let res_flag = open_in_finder("-R".into());
    assert!(res_flag.is_err());
    assert!(res_flag.unwrap_err().contains("Invalid path parameter"));

    // 3. Null-byte injection attempt
    let res_null = open_in_finder("/tmp/fake\0something".into());
    assert!(res_null.is_err());
    assert!(res_null.unwrap_err().contains("Invalid path parameter"));

    // 4. Empty string
    let res_empty = open_in_finder("   ".into());
    assert!(res_empty.is_err());
}

#[test]
fn test_cleaner_integration_toctou_symlink_swap_aborted() {
    let db = Database::in_memory().unwrap();
    let cancel = Arc::new(AtomicBool::new(false));
    let temp = create_temp_test_dir("cleaner_toctou");

    // Attack simulation: Symlink pointing to a protected macOS root system binary (/bin/sh)
    let sensitive_target = Path::new("/bin/sh");
    assert!(sensitive_target.exists(), "/bin/sh must exist on macOS");

    let cache_file = temp.join("malicious_symlink.cache");
    std::os::unix::fs::symlink(sensitive_target, &cache_file).unwrap();

    let req = CleanRequest {
        paths: vec![cache_file.to_string_lossy().to_string()],
        targets: None,
        method: "trash".into(),
        dry_run: true,
        confirmed: true,
    };

    let res = Cleaner::clean_items(req, &db, cancel).unwrap();
    // Must NOT succeed in cleaning/deleting protected symlink targets
    assert_eq!(res.items_deleted, 0);
    assert_eq!(res.items_failed, 1);
    assert!(
        res.errors[0].error_message.contains("system-protected")
            || res.errors[0].error_message.contains("Safety violation")
    );

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_docker_security_boundaries_and_volume_protection() {
    let db = Database::in_memory().unwrap();

    // 1. Volumes are strictly non-deletable
    let vol_req = DockerCleanRequest {
        resource_ids: vec!["vol_postgres_data".into()],
        resource_types: vec!["volume".into()],
        dry_run: false,
        confirmed: true,
    };
    let vol_res = DockerManager::clean(vol_req, &db);
    assert!(vol_res.is_err());
    assert!(vol_res.unwrap_err().contains("Volumes are protected"));

    // 2. Command injection in resource ID is rejected
    let injection_req = DockerCleanRequest {
        resource_ids: vec!["container_123; rm -rf /".into()],
        resource_types: vec!["stopped_container".into()],
        dry_run: false,
        confirmed: true,
    };
    let inj_res = DockerManager::clean(injection_req, &db);
    assert!(inj_res.is_err());
    assert!(inj_res.unwrap_err().contains("Command Injection Rejection"));
}

#[test]
fn test_bounded_synthetic_benchmark() {
    let temp = create_temp_test_dir("bench_synthetic");

    // Construct a bounded tree: 5 directories, 200 files each = 1,000 files
    let num_dirs = 5;
    let files_per_dir = 200;
    let total_expected_files = num_dirs * files_per_dir;

    for d in 0..num_dirs {
        let sub = temp.join(format!("subdir_{}", d));
        fs::create_dir_all(&sub).unwrap();
        for f in 0..files_per_dir {
            let file_path = sub.join(format!("cache_{}_{}.tmp", d, f));
            let payload = format!("data-block-{}-{}", d, f);
            let mut file = fs::File::create(&file_path).unwrap();
            let _ = file.write_all(payload.as_bytes()).unwrap();
        }
    }

    // Benchmark 1: Measure scanning throughput
    let start = Instant::now();
    let (total_bytes, total_count) = Scanner::measure_path(&temp);
    let duration = start.elapsed();

    assert_eq!(total_count, total_expected_files);
    assert!(total_bytes > 0);

    let duration_ms = duration.as_millis().max(1);
    let files_per_sec = (total_count as f64 / duration.as_secs_f64()).max(0.0);
    println!("\n--- [BENCHMARK] Synthetic Filesystem Scan ---");
    println!(
        "Items scanned: {} in {:?} ({:.0} files/sec)",
        total_count, duration, files_per_sec
    );

    // Throughput invariant: processing 1,000 local temp files must take less than 1.5 seconds in debug mode
    assert!(duration_ms < 1500, "Scan took too long: {} ms", duration_ms);

    // Benchmark 2: Cancellation responsiveness
    let cancel = Arc::new(AtomicBool::new(true)); // Pre-cancelled
    let cancel_start = Instant::now();
    let scan_cancel_res = Scanner::scan_with_config(
        myclean_lib::scanner::ScanScopeConfig::default(),
        cancel,
        |_| {},
    );
    let cancel_duration = cancel_start.elapsed();

    assert!(scan_cancel_res.was_cancelled);
    println!("Cancellation latency: {:?}", cancel_duration);
    // Cancellation check must return in under 50ms
    assert!(
        cancel_duration.as_millis() < 50,
        "Cancellation too slow: {:?}",
        cancel_duration
    );

    // Clean up temporary fixture
    let _ = fs::remove_dir_all(&temp);
}
