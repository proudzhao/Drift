mod edit_mode;
mod layout;
mod send_window;
mod shortcuts;
mod state;

pub use edit_mode::EditModeChanged;
pub use layout::WindowLayout;
pub use shortcuts::ShortcutChanged;
pub use state::EditModeState;

use tauri::{App, AppHandle, State};

use crate::app_config;

#[tauri::command]
pub fn set_edit_mode(
    app: AppHandle,
    state: State<'_, EditModeState>,
    enabled: bool,
) -> Result<EditModeChanged, String> {
    edit_mode::set_edit_mode(app, state, enabled)
}

pub fn toggle_edit_mode(
    app: &AppHandle,
    state: &State<'_, EditModeState>,
) -> Result<EditModeChanged, String> {
    edit_mode::toggle_edit_mode(app, state)
}

pub fn set_click_through(app: &AppHandle, enabled: bool) -> Result<(), String> {
    edit_mode::set_click_through(app, enabled)
}

#[tauri::command]
pub fn set_edit_mode_shortcut(
    app: AppHandle,
    state: State<'_, EditModeState>,
    shortcut: String,
) -> Result<EditModeChanged, String> {
    shortcuts::set_edit_mode_shortcut(app, state, shortcut)
}

#[tauri::command]
pub fn set_overlay_window_shortcut(
    app: AppHandle,
    state: State<'_, EditModeState>,
    shortcut: String,
) -> Result<ShortcutChanged, String> {
    shortcuts::set_overlay_window_shortcut(app, state, shortcut)
}

#[tauri::command]
pub fn set_send_danmaku_shortcut(
    app: AppHandle,
    state: State<'_, EditModeState>,
    shortcut: String,
) -> Result<ShortcutChanged, String> {
    shortcuts::set_send_danmaku_shortcut(app, state, shortcut)
}

#[tauri::command]
pub fn open_send_danmaku_window(app: AppHandle) -> Result<(), String> {
    send_window::open_send_danmaku_window(app)
}

#[tauri::command]
pub fn hide_send_danmaku_window(app: AppHandle) -> Result<(), String> {
    send_window::hide_send_danmaku_window(app)
}

#[tauri::command]
pub fn begin_send_danmaku_window_drag(
    app: AppHandle,
    state: State<'_, EditModeState>,
    screen_x: f64,
    screen_y: f64,
) -> Result<(), String> {
    send_window::begin_send_danmaku_window_drag(app, state, screen_x, screen_y)
}

#[tauri::command]
pub fn drag_send_danmaku_window(
    app: AppHandle,
    state: State<'_, EditModeState>,
    screen_x: f64,
    screen_y: f64,
) -> Result<(), String> {
    send_window::drag_send_danmaku_window(app, state, screen_x, screen_y)
}

#[tauri::command]
pub fn end_send_danmaku_window_drag(state: State<'_, EditModeState>) -> Result<(), String> {
    send_window::end_send_danmaku_window_drag(state)
}

#[tauri::command]
pub fn save_window_layout(app: AppHandle) -> Result<WindowLayout, String> {
    layout::save_window_layout(app)
}

#[tauri::command]
pub fn load_window_layout(app: AppHandle) -> Result<Option<WindowLayout>, String> {
    layout::load_window_layout(app)
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    layout::restore_window_layout(app.handle());
    let configured_shortcuts = app_config::read_app_config(app.handle())
        .map(|config| config.shortcuts)
        .unwrap_or_else(|error| {
            tracing::warn!(
                target: "drift::window",
                error = %error,
                "failed to read shortcuts from app config; using default shortcuts"
            );
            app_config::ShortcutConfig::default()
        });
    shortcuts::register_global_shortcuts(app, &configured_shortcuts)?;
    Ok(())
}
