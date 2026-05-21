mod app_config;
mod bilibili;
mod logging;
mod tray;
mod update_check;
mod window_control;

#[tauri::command]
fn set_click_through(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    window_control::set_click_through(&app, enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(bilibili::DanmakuTaskState::default())
        .manage(window_control::EditModeState::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            logging::init(app.handle())?;
            window_control::setup(app)?;
            tray::setup(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" || window.label() == "control" {
                tray::prevent_close_to_tray(window, event);
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_config::load_app_config,
            app_config::save_app_config,
            logging::open_log_dir,
            logging::export_diagnostics,
            set_click_through,
            tray::hide_window,
            tray::show_window,
            window_control::set_edit_mode,
            window_control::set_edit_mode_shortcut,
            window_control::save_window_layout,
            window_control::load_window_layout,
            bilibili::start_bilibili_danmaku,
            bilibili::stop_bilibili_danmaku,
            bilibili::test_bilibili_api,
            update_check::check_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
