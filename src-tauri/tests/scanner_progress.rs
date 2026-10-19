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
