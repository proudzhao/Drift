mod app_config;
mod bilibili;
mod logging;
mod tray;
mod update_check;
mod window_control;

use tauri::Manager;

#[tauri::command]
fn set_click_through(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    window_control::set_click_through(&app, enabled)
}

#[tauri::command]
async fn open_help_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("help") {
        let _ = window.close();
        // Wait for the window to fully close on all platforms
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    let _ =
        tauri::WebviewWindowBuilder::new(&app, "help", tauri::WebviewUrl::App("help.html".into()))
            .title("如何获取房间号")
            .inner_size(420.0, 480.0)
            .resizable(false)
            .center()
            .build();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(bilibili::DanmakuTaskState::default())
        .manage(window_control::EditModeState::default())
        .manage(update_check::UpdateCheckState::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            logging::init(app.handle())?;
            window_control::setup(app)?;
            tray::setup(app)?;
            update_check::start_auto_check(app.handle().clone());
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
            window_control::set_overlay_window_shortcut,
            window_control::save_window_layout,
            window_control::load_window_layout,
            bilibili::ws::start_bilibili_danmaku,
            bilibili::ws::stop_bilibili_danmaku,
            bilibili::diagnostics::test_bilibili_api,
            bilibili::auth::auth_get_status,
            bilibili::auth::auth_start_qr_login,
            bilibili::auth::auth_poll_qr_login,
            bilibili::auth::auth_validate_session,
            bilibili::auth::auth_logout,
            update_check::get_app_version,
            update_check::check_update,
            update_check::get_cached_update_result,
            open_help_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
