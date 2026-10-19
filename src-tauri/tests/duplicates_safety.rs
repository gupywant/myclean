use myclean_lib::db::Database;
use myclean_lib::duplicates::{
    CleanDuplicatesRequest, DuplicateGroupCleanSelection, DuplicateScanner,
};
use std::fs;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[test]
fn test_integration_original_preservation_enforced() {
    let temp = std::env::temp_dir().join(format!(
        "myclean_test_orig_preserv_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&temp).unwrap();

    let file_a = temp.join("orig.txt");
    let file_b = temp.join("clone.txt");

    fs::write(&file_a, b"identical integration test content").unwrap();
    fs::write(&file_b, b"identical integration test content").unwrap();

    let scan = DuplicateScanner::scan_duplicates_advanced(
        &temp,
        1,
        Arc::new(AtomicBool::new(false)),
        |_| {},
    );

    assert_eq!(scan.groups.len(), 1);
    let group = &scan.groups[0];
    let db = Database::in_memory().unwrap();

    // Attempt 1: Target BOTH files for deletion (no original left)
    let bad_req = CleanDuplicatesRequest {
        groups: vec![DuplicateGroupCleanSelection {
            group_hash: group.hash.clone(),
            original_path: file_a.to_string_lossy().to_string(),
            paths_to_delete: vec![
                file_a.to_string_lossy().to_string(),
                file_b.to_string_lossy().to_string(),
            ],
        }],
        dry_run: true,
        confirmed: true,
    };

    let cancel_token = Arc::new(AtomicBool::new(false));
    let res = DuplicateScanner::clean_duplicate_groups(bad_req, &db, cancel_token.clone());
    assert!(res.is_err(), "Must strictly reject trashing the original");

    // Attempt 2: Target with an invalid/mismatched original path
    let bad_orig_req = CleanDuplicatesRequest {
        groups: vec![DuplicateGroupCleanSelection {
            group_hash: group.hash.clone(),
            original_path: temp.join("non_existent.txt").to_string_lossy().to_string(),
            paths_to_delete: vec![file_b.to_string_lossy().to_string()],
        }],
        dry_run: true,
        confirmed: true,
    };
    let res2 = DuplicateScanner::clean_duplicate_groups(bad_orig_req, &db, cancel_token);
    assert!(
        res2.is_err(),
        "Must strictly reject non-existent designated original"
    );

    let _ = fs::remove_dir_all(&temp);
}

#[test]
fn test_integration_anti_race_condition_hash_recheck() {
    let temp = std::env::temp_dir().join(format!(
        "myclean_test_race_cond_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&temp).unwrap();

    let file_a = temp.join("a.bin");
    let file_b = temp.join("b.bin");

    let original_bytes = vec![0xAB; 2048];
    fs::write(&file_a, &original_bytes).unwrap();
    fs::write(&file_b, &original_bytes).unwrap();

    let scan = DuplicateScanner::scan_duplicates_advanced(
        &temp,
        1,
        Arc::new(AtomicBool::new(false)),
        |_| {},
    );

    let group = &scan.groups[0];
    let db = Database::in_memory().unwrap();

    // Alter file_b on disk AFTER scan completes
    fs::write(&file_b, b"tampered content modified post-scan").unwrap();

    let req = CleanDuplicatesRequest {
        groups: vec![DuplicateGroupCleanSelection {
            group_hash: group.hash.clone(),
            original_path: file_a.to_string_lossy().to_string(),
            paths_to_delete: vec![file_b.to_string_lossy().to_string()],
        }],
        dry_run: false,
        confirmed: true,
    };

    let cancel_token = Arc::new(AtomicBool::new(false));
    let res = DuplicateScanner::clean_duplicate_groups(req, &db, cancel_token).unwrap();

    // Verification: File_b was altered and therefore should be skipped to prevent deleting modified data!
    assert_eq!(res.items_skipped, 1);
    assert_eq!(res.items_deleted, 0);
    assert!(file_b.exists(), "Tampered file must not be trashed");

    let _ = fs::remove_dir_all(&temp);
}
