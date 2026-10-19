pub mod apps;
pub mod cleaner;
pub mod commands;
pub mod db;
pub mod developer;
pub mod docker;
pub mod duplicates;
pub mod notifications;
pub mod safety;
pub mod scanner;
pub mod storage;
pub mod system;

use commands::AppState;
use db::Database;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Database::new().expect("Failed to initialize myclean SQLite database");
    let app_state = AppState {
        db: Arc::new(db),
        scan_cancel_token: Arc::new(AtomicBool::new(false)),
        clean_cancel_token: Arc::new(AtomicBool::new(false)),
        duplicate_cancel_token: Arc::new(AtomicBool::new(false)),
        duplicate_clean_cancel_token: Arc::new(AtomicBool::new(false)),
        storage_cancel_token: Arc::new(AtomicBool::new(false)),
        developer_cancel_token: Arc::new(AtomicBool::new(false)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(app_state)
        .setup(|app| {
            let handle = app.handle().clone();

            // Auto-trigger scan on launch if requested via environment variable or CLI flag
            if std::env::var("MYCLEAN_START_SCAN").is_ok() {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    let _ = h.emit("trigger:start_scan", ());
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_metrics,
            commands::start_scan,
            commands::cancel_scan,
            commands::clean_items,
            commands::cancel_clean,
            commands::check_active_applications,
            commands::scan_duplicates,
            commands::cancel_duplicate_scan,
            commands::clean_duplicates,
            commands::cancel_duplicate_clean,
            commands::scan_applications,
            commands::scan_orphaned_data,
            commands::inspect_dropped_app,
            commands::uninstall_application,
            commands::clean_orphaned_data,
            commands::scan_developer_spaces,
            commands::cancel_developer_scan,
            commands::inspect_developer_workspace,
            commands::clean_developer_artifacts,
            commands::inspect_docker,
            commands::clean_docker_resources,
            commands::get_scan_history,
            commands::get_cleanup_history,
            commands::get_whitelist,
            commands::add_to_whitelist,
            commands::remove_from_whitelist,
            commands::get_app_setting,
            commands::set_app_setting,
            commands::get_preferences,
            commands::update_preferences,
            commands::get_all_exclusions,
            commands::add_custom_exclusion,
            commands::remove_custom_exclusion,
            commands::query_cleanup_history,
            commands::get_cleanup_analytics,
            commands::check_database_integrity,
            commands::prune_history_by_retention,
            commands::clear_cleanup_history,
            commands::clear_scan_history,
            commands::send_test_notification,
            commands::analyze_storage,
            commands::cancel_storage_analysis,
            commands::open_in_finder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
