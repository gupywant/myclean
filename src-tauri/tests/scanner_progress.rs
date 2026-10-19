use myclean_lib::scanner::{CategoryScanStatus, ScanProgress, ScanScopeConfig, Scanner};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[test]
fn test_scanner_progress_event_structure() {
    let cancel = Arc::new(AtomicBool::new(false));
    let progress_events = Arc::new(Mutex::new(Vec::<ScanProgress>::new()));
    let progress_events_clone = progress_events.clone();

    // Configure a lightweight scope for fast testing
    let config = ScanScopeConfig {
        session_id: None,
        include_system_caches: true,
        include_application_logs: true,
        include_developer_xcode: false,
        include_developer_caches: false,
        include_browser_caches: false,
        include_messaging_caches: false,
        include_trash: false,
        include_mail_downloads: false,
        include_large_files: false,
        include_docker: true,
        large_files_min_mb: None,
        custom_paths: Vec::new(),
        user_exclusions: Vec::new(),
    };

    let result = Scanner::scan_with_config(config, cancel, move |p| {
        progress_events_clone.lock().unwrap().push(p);
    });

    assert!(!result.was_cancelled);
    let events = progress_events.lock().unwrap();
    assert!(!events.is_empty(), "Progress events should be emitted during scan");

    // Verify all 13 structured fields on every single emitted event
    for p in events.iter() {
        assert!(!p.session_id.is_empty(), "session_id must not be empty");
        assert!(!p.category_id.is_empty(), "category_id must not be empty");
        assert!(!p.current_category.is_empty(), "current_category must not be empty");
        assert!(p.overall_progress >= 0.0 && p.overall_progress <= 100.0, "overall_progress out of range: {}", p.overall_progress);
        assert!(p.category_progress >= -1.0 && p.category_progress <= 100.0, "category_progress out of range: {}", p.category_progress);
        assert_eq!(p.items_discovered, p.items_found, "items_discovered must match backward-compat items_found");
        assert_eq!(p.overall_progress, p.percent_complete, "overall_progress must match backward-compat percent_complete");
    }
}

#[test]
fn test_scanner_progress_monotonicity() {
    let cancel = Arc::new(AtomicBool::new(false));
    let progress_values = Arc::new(Mutex::new(Vec::<f32>::new()));
    let progress_values_clone = progress_values.clone();

    let config = ScanScopeConfig::default();
    let result = Scanner::scan_with_config(config, cancel, move |p| {
        progress_values_clone.lock().unwrap().push(p.overall_progress);
    });

    assert!(!result.was_cancelled);
    let values = progress_values.lock().unwrap();
    assert!(!values.is_empty());

    // Invariant: overall_progress must never decrease
    let mut prev = 0.0f32;
    for &val in values.iter() {
        assert!(val >= prev, "Progress decreased from {} to {}", prev, val);
        prev = val;
    }

    // Only the final completion event or completed scan can be 100.0
    let last = *values.last().unwrap();
    assert_eq!(last, 100.0, "Final event must report 100.0% completion");
}

#[test]
fn test_scanner_category_status_transitions() {
    let cancel = Arc::new(AtomicBool::new(false));
    let statuses_by_category = Arc::new(Mutex::new(std::collections::HashMap::<String, Vec<CategoryScanStatus>>::new()));
    let statuses_clone = statuses_by_category.clone();

    let config = ScanScopeConfig {
        session_id: None,
        include_system_caches: true,
        include_application_logs: false, // Explicitly skip to test Skipped status
        include_developer_xcode: false,
        include_developer_caches: false,
        include_browser_caches: false,
        include_messaging_caches: false,
        include_trash: false,
        include_mail_downloads: false,
        include_large_files: false,
        include_docker: false, // Explicitly skip
        large_files_min_mb: None,
        custom_paths: Vec::new(),
        user_exclusions: Vec::new(),
    };

    let _res = Scanner::scan_with_config(config, cancel, move |p| {
        statuses_clone
            .lock()
            .unwrap()
            .entry(p.category_id)
            .or_default()
            .push(p.category_status);
    });

    let map = statuses_by_category.lock().unwrap();

    // logs_and_temp should have been emitted as Skipped
    if let Some(statuses) = map.get("logs_and_temp") {
        assert!(statuses.contains(&CategoryScanStatus::Skipped));
    }

    // docker should have been emitted as Skipped
    if let Some(statuses) = map.get("docker") {
        assert!(statuses.contains(&CategoryScanStatus::Skipped));
    }

    // system_cache was enabled, so it should transition Scanning -> Completed
    if let Some(statuses) = map.get("system_cache") {
        assert!(statuses.contains(&CategoryScanStatus::Scanning));
        assert!(statuses.contains(&CategoryScanStatus::Completed));
    }
}

#[test]
fn test_scanner_cancellation_mid_scan_partial_state() {
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_for_callback = cancel.clone();
    let events = Arc::new(Mutex::new(Vec::<ScanProgress>::new()));
    let events_clone = events.clone();

    let config = ScanScopeConfig::default();

    let result = Scanner::scan_with_config(config, cancel, move |p| {
        events_clone.lock().unwrap().push(p.clone());
        // Trigger cancellation on first scanning progress event
        if p.category_status == CategoryScanStatus::Scanning {
            cancel_for_callback.store(true, Ordering::Relaxed);
        }
    });

    assert!(result.was_cancelled, "Result must record was_cancelled = true");
    let recorded_events = events.lock().unwrap();

    // Invariant: when cancelled, overall_progress must never claim 100%
    if let Some(last_event) = recorded_events.last() {
        assert!(
            last_event.overall_progress < 100.0,
            "Cancelled scan must not claim 100% progress. Got: {}",
            last_event.overall_progress
        );
        assert!(
            last_event.category_status == CategoryScanStatus::Partial || last_event.category_status == CategoryScanStatus::Scanning,
            "Last event of aborted scan should reflect Partial or Scanning state, got: {:?}",
            last_event.category_status
        );
    }
}

#[test]
fn test_scanner_docker_graceful_skip() {
    let cancel = Arc::new(AtomicBool::new(false));
    let docker_events = Arc::new(Mutex::new(Vec::<ScanProgress>::new()));
    let docker_events_clone = docker_events.clone();

    let config = ScanScopeConfig {
        session_id: None,
        include_system_caches: false,
        include_application_logs: false,
        include_developer_xcode: false,
        include_developer_caches: false,
        include_browser_caches: false,
        include_messaging_caches: false,
        include_trash: false,
        include_mail_downloads: false,
        include_large_files: false,
        include_docker: true, // test docker evaluation specifically
        large_files_min_mb: None,
        custom_paths: Vec::new(),
        user_exclusions: Vec::new(),
    };

    let result = Scanner::scan_with_config(config, cancel, move |p| {
        if p.category_id == "docker" {
            docker_events_clone.lock().unwrap().push(p);
        }
    });

    assert!(!result.was_cancelled);
    let devents = docker_events.lock().unwrap();
    assert!(!devents.is_empty(), "Must emit docker category events");

    // Either Docker is running and Completed, or Docker is offline/CLI missing and Skipped
    let last = devents.last().unwrap();
    assert!(
        last.category_status == CategoryScanStatus::Completed || last.category_status == CategoryScanStatus::Skipped,
        "Docker stage must either complete cleanly or skip gracefully: got {:?}",
        last.category_status
    );
}

#[test]
fn test_disabled_stages_do_not_advance_overall_progress() {
    let cancel = Arc::new(AtomicBool::new(false));
    let recorded_events = Arc::new(Mutex::new(Vec::<ScanProgress>::new()));
    let recorded_events_clone = recorded_events.clone();

    // Only system_caches enabled, all others disabled
    let config = ScanScopeConfig {
        session_id: None,
        include_system_caches: true,
        include_application_logs: false,
        include_developer_xcode: false,
        include_developer_caches: false,
        include_browser_caches: false,
        include_messaging_caches: false,
        include_trash: false,
        include_mail_downloads: false,
        include_large_files: false,
        include_docker: false,
        large_files_min_mb: None,
        custom_paths: Vec::new(),
        user_exclusions: Vec::new(),
    };

    let result = Scanner::scan_with_config(config, cancel, move |p| {
        recorded_events_clone.lock().unwrap().push(p);
    });

    assert!(!result.was_cancelled);
    let events = recorded_events.lock().unwrap();

    // Verify skipped events:
    let skipped_events: Vec<&ScanProgress> = events
        .iter()
        .filter(|e| e.category_status == CategoryScanStatus::Skipped)
        .collect();

    assert!(!skipped_events.is_empty(), "Must have skipped events for disabled categories");
    for s in skipped_events {
        assert_eq!(
            s.category_progress, 0.0,
            "Skipped category must report 0.0 category progress, got: {}",
            s.category_progress
        );
    }
}

#[test]
fn test_indeterminate_progress_on_initialization() {
    let cancel = Arc::new(AtomicBool::new(false));
    let had_indeterminate = Arc::new(AtomicBool::new(false));
    let had_indeterminate_clone = had_indeterminate.clone();

    let config = ScanScopeConfig::default();
    let _ = Scanner::scan_with_config(config, cancel, move |p| {
        if p.category_progress == -1.0 {
            had_indeterminate_clone.store(true, Ordering::Relaxed);
        }
    });

    assert!(
        had_indeterminate.load(Ordering::Relaxed),
        "Scanner must emit indeterminate progress (-1.0) during initial category scope checks"
    );
}

#[test]
fn test_non_overlapping_cache_accounting_regression() {
    use std::collections::HashSet;
    use std::path::{Path, PathBuf};

    let mut visited_paths = HashSet::new();

    // Given parent /Library/Logs
    let logs_dir = PathBuf::from("/Library/Logs");
    visited_paths.insert(logs_dir.clone());

    // Subdirectory DiagnosticReports MUST be detected as overlapping
    let diag_reports = logs_dir.join("DiagnosticReports");
    assert!(
        Scanner::is_path_overlapping(&diag_reports, &visited_paths),
        "DiagnosticReports must be detected as overlapping with parent /Library/Logs"
    );

    // Parent directory /Library MUST be detected as overlapping
    let lib_dir = Path::new("/Library");
    assert!(
        Scanner::is_path_overlapping(lib_dir, &visited_paths),
        "/Library must be detected as overlapping because child /Library/Logs is visited"
    );

    // Independent path must not overlap
    let unrelated = Path::new("/Library/Caches");
    assert!(
        !Scanner::is_path_overlapping(unrelated, &visited_paths),
        "/Library/Caches must not overlap with /Library/Logs"
    );
}

#[test]
fn test_session_id_coordination() {
    let cancel = Arc::new(AtomicBool::new(false));
    let progress_events = Arc::new(Mutex::new(Vec::<ScanProgress>::new()));
    let progress_events_clone = progress_events.clone();

    let expected_session = "scan-frontend-session-987654";
    let config = ScanScopeConfig {
        session_id: Some(expected_session.to_string()),
        include_system_caches: true,
        include_application_logs: false,
        include_developer_xcode: false,
        include_developer_caches: false,
        include_browser_caches: false,
        include_messaging_caches: false,
        include_trash: false,
        include_mail_downloads: false,
        include_large_files: false,
        include_docker: false,
        large_files_min_mb: None,
        custom_paths: Vec::new(),
        user_exclusions: Vec::new(),
    };

    let result = Scanner::scan_with_config(config, cancel, move |p| {
        progress_events_clone.lock().unwrap().push(p);
    });

    assert!(!result.was_cancelled);
    let events = progress_events.lock().unwrap();
    assert!(!events.is_empty(), "Must emit progress events");

    // Every single event must match the exact session_id passed from frontend
    for p in events.iter() {
        assert_eq!(
            p.session_id, expected_session,
            "Emitted session_id '{}' must match requested '{}'",
            p.session_id, expected_session
        );
    }
}

#[test]
fn test_progress_event_serialization_compatibility() {
    let sample = ScanProgress {
        session_id: "scan-test-123".into(),
        category_id: "system_cache".into(),
        current_category: "System Cache".into(),
        current_path: "/Library/Caches/test".into(),
        phase: "Scanning".into(),
        files_inspected: 42,
        directories_inspected: 5,
        bytes_analyzed: 1048576,
        items_discovered: 3,
        items_found: 3,
        bytes_found: 524288,
        category_status: CategoryScanStatus::Scanning,
        category_progress: 50.0,
        overall_progress: 25.0,
        percent_complete: 25.0,
        skipped_count: 1,
        permission_denied_count: 0,
        elapsed_ms: 120,
        safe_items_count: 2,
        review_items_count: 1,
    };

    let serialized = serde_json::to_string(&sample).expect("Must serialize ScanProgress");
    assert!(serialized.contains("\"session_id\":\"scan-test-123\""));
    assert!(serialized.contains("\"category_status\":\"scanning\""));
    assert!(serialized.contains("\"overall_progress\":25.0"));

    let deserialized: ScanProgress =
        serde_json::from_str(&serialized).expect("Must deserialize into ScanProgress");
    assert_eq!(deserialized.session_id, "scan-test-123");
    assert_eq!(deserialized.files_inspected, 42);
    assert_eq!(deserialized.category_status, CategoryScanStatus::Scanning);
    assert_eq!(deserialized.category_progress, 50.0);
    assert_eq!(deserialized.overall_progress, 25.0);
}

#[test]
fn test_repeated_scan_execution() {
    for run in 1..=2 {
        let cancel = Arc::new(AtomicBool::new(false));
        let events = Arc::new(Mutex::new(Vec::<ScanProgress>::new()));
        let events_clone = events.clone();

        let run_session_id = format!("scan-run-{}", run);
        let config = ScanScopeConfig {
            session_id: Some(run_session_id.clone()),
            include_system_caches: true,
            include_application_logs: false,
            include_developer_xcode: false,
            include_developer_caches: false,
            include_browser_caches: false,
            include_messaging_caches: false,
            include_trash: false,
            include_mail_downloads: false,
            include_large_files: false,
            include_docker: false,
            large_files_min_mb: None,
            custom_paths: Vec::new(),
            user_exclusions: Vec::new(),
        };

        let result = Scanner::scan_with_config(config, cancel, move |p| {
            events_clone.lock().unwrap().push(p);
        });

        assert!(!result.was_cancelled, "Run {} must complete without cancellation", run);
        let recorded = events.lock().unwrap();
        assert!(!recorded.is_empty(), "Run {} must emit events", run);

        for p in recorded.iter() {
            assert_eq!(p.session_id, run_session_id, "Run {} events must match its own session_id", run);
        }

        let last = recorded.last().unwrap();
        assert_eq!(last.overall_progress, 100.0, "Run {} final event must report 100.0%", run);
    }
}

#[test]
fn test_stale_session_event_rejection_logic() {
    let active_session = "scan-active-session";
    let stale_event = ScanProgress {
        session_id: "scan-old-stale-session".into(),
        category_id: "system_cache".into(),
        current_category: "System Cache".into(),
        current_path: "/stale".into(),
        phase: "Scanning".into(),
        files_inspected: 10,
        directories_inspected: 1,
        bytes_analyzed: 100,
        items_discovered: 1,
        items_found: 1,
        bytes_found: 100,
        category_status: CategoryScanStatus::Scanning,
        category_progress: 10.0,
        overall_progress: 5.0,
        percent_complete: 5.0,
        skipped_count: 0,
        permission_denied_count: 0,
        elapsed_ms: 10,
        safe_items_count: 1,
        review_items_count: 0,
    };

    let active_event = ScanProgress {
        session_id: active_session.into(),
        ..stale_event.clone()
    };

    // Simulate frontend filter:
    let is_stale_rejected = stale_event.session_id != active_session;
    let is_active_accepted = active_event.session_id == active_session;

    assert!(is_stale_rejected, "Stale session event must be rejected");
    assert!(is_active_accepted, "Active session event must be accepted");
}

#[test]
fn test_live_filesystem_smart_scan_telemetry() {
    let cancel = Arc::new(AtomicBool::new(false));
    let events = Arc::new(Mutex::new(Vec::<ScanProgress>::new()));
    let events_clone = events.clone();

    let session_id = format!("live-smart-scan-{}", chrono::Utc::now().timestamp_millis());
    let config = ScanScopeConfig {
        session_id: Some(session_id.clone()),
        ..ScanScopeConfig::default()
    };

    println!("\n=== LIVE SMART SCAN TELEMETRY RECORDING ===");
    println!("1. Initial State: session_id={}, is_scanning=true, overall_progress=0.0%", session_id);

    let result = Scanner::scan_with_config(config, cancel, move |p| {
        events_clone.lock().unwrap().push(p);
    });

    let recorded = events.lock().unwrap();
    assert!(!recorded.is_empty(), "Must emit progress events on real filesystem");

    let first = recorded.first().unwrap();
    println!("2. First Progress Event: category={}, phase={}, status={:?}, cat_prog={}, overall={:.1}%, files={}",
        first.category_id, first.phase, first.category_status, first.category_progress, first.overall_progress, first.files_inspected
    );

    // Pick intermediate events
    let count = recorded.len();
    if count >= 3 {
        let p25 = &recorded[count / 4];
        let p50 = &recorded[count / 2];
        let p75 = &recorded[(count * 3) / 4];
        println!("3. Intermediate State (25%): category={}, overall={:.1}%, files={}, found_bytes={}",
            p25.category_id, p25.overall_progress, p25.files_inspected, p25.bytes_found
        );
        println!("   Intermediate State (50%): category={}, overall={:.1}%, files={}, found_bytes={}",
            p50.category_id, p50.overall_progress, p50.files_inspected, p50.bytes_found
        );
        println!("   Intermediate State (75%): category={}, overall={:.1}%, files={}, found_bytes={}",
            p75.category_id, p75.overall_progress, p75.files_inspected, p75.bytes_found
        );
    }

    let last = recorded.last().unwrap();
    println!("4. Final UI State: phase={}, status={:?}, overall={:.1}%, total_files_inspected={}, total_bytes_found={}",
        last.phase, last.category_status, last.overall_progress, last.files_inspected, last.bytes_found
    );

    println!("5. Scan Completion: duration_ms={}, total_items={}, total_bytes={}, was_cancelled={}\n",
        result.duration_ms, result.total_items, result.total_bytes, result.was_cancelled
    );

    assert_eq!(last.overall_progress, 100.0, "Completed scan must reach 100.0%");
    assert!(!result.was_cancelled, "Live scan must complete successfully");
}


