#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--scan" || a == "scan") {
        std::env::set_var("MYCLEAN_START_SCAN", "1");
    }
    myclean_lib::run();
}

