use tauri::{menu::MenuBuilder, tray::TrayIconBuilder, App, AppHandle, Manager, Runtime, Window};

use crate::window_control::{self, EditModeState};

const MENU_SHOW_OVERLAY: &str = "show_overlay";
const MENU_HIDE_OVERLAY: &str = "hide_overlay";
const MENU_TOGGLE_EDIT_MODE: &str = "toggle_edit_mode";
const MENU_SHOW_CONTROL: &str = "show_control";
const MENU_EXIT: &str = "exit";

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text(MENU_SHOW_OVERLAY, "显示弹幕窗口")
        .text(MENU_HIDE_OVERLAY, "隐藏弹幕窗口")
        .text(MENU_TOGGLE_EDIT_MODE, "切换模式")
        .text(MENU_SHOW_CONTROL, "显示设置")
        .separator()
        .text(MENU_EXIT, "退出 Drift")
        .build()?;

    let mut builder = TrayIconBuilder::with_id("drift")
        .menu(&menu)
        .tooltip("Drift")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_SHOW_OVERLAY => {
                let _ = show_window_by_label(app, "main");
            }
            MENU_HIDE_OVERLAY => {
                let _ = hide_window_by_label(app, "main");
            }
            MENU_TOGGLE_EDIT_MODE => {
                let state = app.state::<EditModeState>();
                let _ = window_control::toggle_edit_mode(app, &state);
            }
            MENU_SHOW_CONTROL => {
                let _ = show_window_by_label(app, "control");
            }
            MENU_EXIT => {
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    tracing::info!(target: "drift::tray", "tray initialized");
    Ok(())
}

pub fn prevent_close_to_tray<R: Runtime>(window: &Window<R>, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
        tracing::info!(
            target: "drift::tray",
            label = window.label(),
            "window close intercepted and hidden to tray"
        );
    }
}

#[tauri::command]
pub fn show_window(app: AppHandle, label: String) -> Result<(), String> {
    show_window_by_label(&app, &label)
}

#[tauri::command]
pub fn hide_window(app: AppHandle, label: String) -> Result<(), String> {
    hide_window_by_label(&app, &label)
}

fn show_window_by_label(app: &AppHandle, label: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

fn hide_window_by_label(app: &AppHandle, label: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    window.hide().map_err(|error| error.to_string())
}
