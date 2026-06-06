use std::fs;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size};

const WINDOW_LAYOUT_FILE: &str = "window-layout.json";
const MIN_WINDOW_WIDTH: u32 = 320;
const MIN_WINDOW_HEIGHT: u32 = 160;
const CONTROL_WINDOW_MARGIN: i32 = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowLayout {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct WindowLayouts {
    main: Option<WindowLayout>,
    control: Option<WindowLayout>,
}

pub fn save_window_layout(app: AppHandle) -> Result<WindowLayout, String> {
    save_window_layout_for_label(&app, "main")
}

pub fn save_window_layout_for_label(app: &AppHandle, label: &str) -> Result<WindowLayout, String> {
    let layout = current_window_layout(app, label)?;
    let mut layouts = read_window_layouts(app)?.unwrap_or_default();
    set_stored_window_layout(&mut layouts, label, layout.clone())?;
    write_window_layouts(app, &layouts)?;
    tracing::info!(
        target: "drift::window",
        label = label,
        x = layout.x,
        y = layout.y,
        width = layout.width,
        height = layout.height,
        "window layout saved"
    );
    Ok(layout)
}

pub fn load_window_layout(app: AppHandle) -> Result<Option<WindowLayout>, String> {
    Ok(read_window_layouts(&app)?.and_then(|layout| layout.main))
}

pub(super) fn restore_window_layout(app: &AppHandle) {
    let layouts = match read_window_layouts(app) {
        Ok(layout) => layout.unwrap_or_default(),
        Err(error) => {
            tracing::warn!(
                target: "drift::window",
                error = %error,
                "failed to read saved window layout"
            );
            WindowLayouts::default()
        }
    };

    if let Some(layout) = layouts.main {
        restore_window_layout_for_label(app, "main", &layout);
    }

    if let Some(layout) = layouts.control {
        restore_window_layout_for_label(app, "control", &layout);
    } else {
        position_control_window_below_overlay(app);
    }
}

fn restore_window_layout_for_label(app: &AppHandle, label: &str, layout: &WindowLayout) {
    let Some(window) = app.get_webview_window(label) else {
        tracing::warn!(
            target: "drift::window",
            label = label,
            "window not found when restoring layout"
        );
        return;
    };

    let size = PhysicalSize::new(
        layout.width.max(min_window_width(label)),
        layout.height.max(min_window_height(label)),
    );
    if let Err(error) = window.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)))
    {
        tracing::warn!(
            target: "drift::window",
            label = label,
            error = %error,
            "failed to restore window size"
        );
    }

    let position = clamp_window_position(&window, PhysicalPosition::new(layout.x, layout.y), size);
    if let Err(error) = window.set_position(Position::Physical(position)) {
        tracing::warn!(
            target: "drift::window",
            label = label,
            error = %error,
            "failed to restore window position"
        );
    }

    tracing::info!(
        target: "drift::window",
        label = label,
        x = position.x,
        y = position.y,
        width = size.width,
        height = size.height,
        "window layout restored"
    );
}

fn position_control_window_below_overlay(app: &AppHandle) {
    let position = || -> Result<PhysicalPosition<i32>, String> {
        let main = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;
        let control = app
            .get_webview_window("control")
            .ok_or_else(|| "control window not found".to_string())?;
        let main_position = main.outer_position().map_err(|error| error.to_string())?;
        let main_size = main.outer_size().map_err(|error| error.to_string())?;
        let control_size = control.outer_size().map_err(|error| error.to_string())?;

        let x = main_position.x + (main_size.width as i32 - control_size.width as i32) / 2;
        let y = main_position.y + main_size.height as i32 + CONTROL_WINDOW_MARGIN;

        Ok(clamp_window_position(
            &control,
            PhysicalPosition::new(x, y),
            control_size,
        ))
    };

    match position() {
        Ok(position) => {
            if let Some(window) = app.get_webview_window("control") {
                if let Err(error) = window.set_position(Position::Physical(position)) {
                    tracing::warn!(
                        target: "drift::window",
                        error = %error,
                        "failed to position control window"
                    );
                }
            }
        }
        Err(error) => tracing::warn!(
            target: "drift::window",
            error = %error,
            "failed to calculate control window position"
        ),
    }
}

fn current_window_layout(app: &AppHandle, label: &str) -> Result<WindowLayout, String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;

    Ok(WindowLayout {
        x: position.x,
        y: position.y,
        width: size.width.max(min_window_width(label)),
        height: size.height.max(min_window_height(label)),
    })
}

fn read_window_layouts(app: &AppHandle) -> Result<Option<WindowLayouts>, String> {
    let path = window_layout_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&content).map_err(|error| error.to_string())?;

    if value.get("main").is_some() || value.get("control").is_some() {
        serde_json::from_value(value)
            .map(Some)
            .map_err(|error| error.to_string())
    } else {
        let main = serde_json::from_value(value).map_err(|error| error.to_string())?;
        Ok(Some(WindowLayouts {
            main: Some(main),
            control: None,
        }))
    }
}

fn write_window_layouts(app: &AppHandle, layout: &WindowLayouts) -> Result<(), String> {
    let path = window_layout_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let content = serde_json::to_string_pretty(layout).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn set_stored_window_layout(
    layouts: &mut WindowLayouts,
    label: &str,
    layout: WindowLayout,
) -> Result<(), String> {
    match label {
        "main" => layouts.main = Some(layout),
        "control" => layouts.control = Some(layout),
        _ => return Err(format!("unsupported window layout label: {}", label)),
    }
    Ok(())
}

fn min_window_width(label: &str) -> u32 {
    if label == "main" {
        MIN_WINDOW_WIDTH
    } else {
        1
    }
}

fn min_window_height(label: &str) -> u32 {
    if label == "main" {
        MIN_WINDOW_HEIGHT
    } else {
        1
    }
}

fn clamp_window_position(
    window: &tauri::WebviewWindow,
    position: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return position;
    };
    let work_area = monitor.work_area();
    let min_x = work_area.position.x;
    let min_y = work_area.position.y;
    let max_x = min_x + work_area.size.width.saturating_sub(window_size.width) as i32;
    let max_y = min_y + work_area.size.height.saturating_sub(window_size.height) as i32;

    PhysicalPosition::new(
        position.x.clamp(min_x, max_x.max(min_x)),
        position.y.clamp(min_y, max_y.max(min_y)),
    )
}

fn window_layout_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(WINDOW_LAYOUT_FILE))
        .map_err(|error| error.to_string())
}
