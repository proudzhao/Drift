use std::fs;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size};

const WINDOW_LAYOUT_FILE: &str = "window-layout.json";
const MIN_WINDOW_WIDTH: u32 = 320;
const MIN_WINDOW_HEIGHT: u32 = 160;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowLayout {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn save_window_layout(app: AppHandle) -> Result<WindowLayout, String> {
    let layout = current_window_layout(&app)?;
    write_window_layout(&app, &layout)?;
    tracing::info!(
        target: "drift::window",
        x = layout.x,
        y = layout.y,
        width = layout.width,
        height = layout.height,
        "window layout saved"
    );
    Ok(layout)
}

pub fn load_window_layout(app: AppHandle) -> Result<Option<WindowLayout>, String> {
    read_window_layout(&app)
}

pub(super) fn restore_window_layout(app: &AppHandle) {
    let Some(layout) = (match read_window_layout(app) {
        Ok(layout) => layout,
        Err(error) => {
            tracing::warn!(
                target: "drift::window",
                error = %error,
                "failed to read saved window layout"
            );
            None
        }
    }) else {
        return;
    };

    let Some(window) = app.get_webview_window("main") else {
        tracing::warn!(target: "drift::window", "main window not found when restoring layout");
        return;
    };

    if let Err(error) = window.set_position(Position::Physical(PhysicalPosition::new(
        layout.x, layout.y,
    ))) {
        tracing::warn!(
            target: "drift::window",
            error = %error,
            "failed to restore window position"
        );
    }

    if let Err(error) = window.set_size(Size::Physical(PhysicalSize::new(
        layout.width.max(MIN_WINDOW_WIDTH),
        layout.height.max(MIN_WINDOW_HEIGHT),
    ))) {
        tracing::warn!(
            target: "drift::window",
            error = %error,
            "failed to restore window size"
        );
    }

    tracing::info!(
        target: "drift::window",
        x = layout.x,
        y = layout.y,
        width = layout.width,
        height = layout.height,
        "window layout restored"
    );
}

fn current_window_layout(app: &AppHandle) -> Result<WindowLayout, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;

    Ok(WindowLayout {
        x: position.x,
        y: position.y,
        width: size.width.max(MIN_WINDOW_WIDTH),
        height: size.height.max(MIN_WINDOW_HEIGHT),
    })
}

fn read_window_layout(app: &AppHandle) -> Result<Option<WindowLayout>, String> {
    let path = window_layout_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn write_window_layout(app: &AppHandle, layout: &WindowLayout) -> Result<(), String> {
    let path = window_layout_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let content = serde_json::to_string_pretty(layout).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn window_layout_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(WINDOW_LAYOUT_FILE))
        .map_err(|error| error.to_string())
}
