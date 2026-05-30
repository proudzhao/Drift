use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::{layout, state::EditModeState};

#[derive(Debug, Clone, Serialize)]
pub struct EditModeChanged {
    pub is_edit_mode: bool,
    pub is_click_through: bool,
    pub shortcut: String,
}

pub fn set_edit_mode(
    app: AppHandle,
    state: State<'_, EditModeState>,
    enabled: bool,
) -> Result<EditModeChanged, String> {
    apply_edit_mode(&app, &state, enabled)
}

pub fn toggle_edit_mode(
    app: &AppHandle,
    state: &State<'_, EditModeState>,
) -> Result<EditModeChanged, String> {
    let next_enabled = {
        let enabled = state.enabled.lock().map_err(|error| error.to_string())?;
        !*enabled
    };
    apply_edit_mode(app, state, next_enabled)
}

fn apply_edit_mode(
    app: &AppHandle,
    state: &State<'_, EditModeState>,
    enabled: bool,
) -> Result<EditModeChanged, String> {
    let was_enabled = {
        let mut current = state.enabled.lock().map_err(|error| error.to_string())?;
        let was_enabled = *current;
        *current = enabled;
        was_enabled
    };

    if enabled {
        show_overlay_window(app)?;
    }
    set_click_through(app, !enabled)?;

    if was_enabled && !enabled {
        if let Err(error) = layout::save_window_layout(app.clone()) {
            tracing::warn!(
                target: "drift::window",
                error = %error,
                "failed to save window layout when exiting edit mode"
            );
        }
    }

    let payload = current_edit_mode_payload(state)?;

    app.emit("edit-mode-changed", &payload)
        .map_err(|error| error.to_string())?;

    tracing::info!(
        target: "drift::window",
        is_edit_mode = payload.is_edit_mode,
        is_click_through = payload.is_click_through,
        "edit mode changed"
    );
    Ok(payload)
}

pub(super) fn current_edit_mode_payload(
    state: &State<'_, EditModeState>,
) -> Result<EditModeChanged, String> {
    let is_edit_mode = *state.enabled.lock().map_err(|error| error.to_string())?;
    let shortcut = state
        .shortcut
        .lock()
        .map_err(|error| error.to_string())?
        .label
        .clone();

    Ok(EditModeChanged {
        is_edit_mode,
        is_click_through: !is_edit_mode,
        shortcut,
    })
}

pub fn set_click_through(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())
}

pub(super) fn toggle_overlay_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let is_visible = window.is_visible().map_err(|error| error.to_string())?;

    if is_visible {
        window.hide().map_err(|error| error.to_string())?;
        tracing::info!(target: "drift::window", "overlay window hidden from shortcut");
    } else {
        window.show().map_err(|error| error.to_string())?;
        tracing::info!(target: "drift::window", "overlay window shown from shortcut");
    }

    Ok(())
}

fn show_overlay_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    if !window.is_visible().map_err(|error| error.to_string())? {
        window.show().map_err(|error| error.to_string())?;
        tracing::info!(target: "drift::window", "overlay window shown when entering edit mode");
    }
    Ok(())
}
