#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--test-notification") {
        myclean_lib::notifications::NotificationManager::send(
            "myclean",
            Some("App Icon Verified"),
            "Native notification with official myclean broom icon.",
        )
        .expect("Failed to send notification");
        return;
    }
    if args.iter().any(|a| a == "--scan" || a == "scan") {
        std::env::set_var("MYCLEAN_START_SCAN", "1");
    }
    myclean_lib::run();
}
