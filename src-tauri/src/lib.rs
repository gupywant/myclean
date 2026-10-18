pub mod apps;
pub mod cleaner;
pub mod commands;
pub mod db;
pub mod developer;
pub mod docker;
pub mod duplicates;
pub mod safety;
pub mod scanner;
pub mod storage;
pub mod system;

use commands::AppState;
use db::Database;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

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
        .manage(app_state)
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
            commands::analyze_storage,
            commands::cancel_storage_analysis,
            commands::open_in_finder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
