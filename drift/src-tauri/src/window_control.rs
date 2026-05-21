use std::{fs, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{
    App, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, State,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::app_config;

const WINDOW_LAYOUT_FILE: &str = "window-layout.json";
const MIN_WINDOW_WIDTH: u32 = 720;
const MIN_WINDOW_HEIGHT: u32 = 160;

pub struct EditModeState {
    enabled: Mutex<bool>,
    shortcut: Mutex<ShortcutBinding>,
    overlay_shortcut: Mutex<ShortcutBinding>,
}

impl Default for EditModeState {
    fn default() -> Self {
        Self {
            enabled: Mutex::new(false),
            shortcut: Mutex::new(default_shortcut_binding()),
            overlay_shortcut: Mutex::new(default_overlay_shortcut_binding()),
        }
    }
}

#[derive(Debug, Clone)]
struct ShortcutBinding {
    label: String,
    shortcut: Shortcut,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum ShortcutKind {
    EditMode,
    OverlayWindow,
}

#[derive(Debug, Clone, Serialize)]
pub struct EditModeChanged {
    pub is_edit_mode: bool,
    pub is_click_through: bool,
    pub shortcut: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShortcutChanged {
    pub shortcut: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowLayout {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub fn set_edit_mode(
    app: AppHandle,
    state: State<'_, EditModeState>,
    enabled: bool,
) -> Result<EditModeChanged, String> {
    apply_edit_mode(&app, &state, enabled)
}

#[tauri::command]
pub fn set_edit_mode_shortcut(
    app: AppHandle,
    state: State<'_, EditModeState>,
    shortcut: String,
) -> Result<EditModeChanged, String> {
    let next_binding = parse_shortcut_binding(&shortcut)?;
    ensure_shortcut_available(&state, &next_binding, ShortcutKind::EditMode)?;
    let previous_binding = {
        let mut current = state.shortcut.lock().map_err(|error| error.to_string())?;
        let previous = current.clone();
        *current = next_binding.clone();
        previous
    };

    app.global_shortcut()
        .unregister(previous_binding.shortcut)
        .map_err(|error| error.to_string())?;
    app.global_shortcut()
        .register(next_binding.shortcut)
        .map_err(|error| error.to_string())?;

    tracing::info!(
        target: "drift::window",
        previous_shortcut = %previous_binding.label,
        shortcut = %next_binding.label,
        "edit mode shortcut updated"
    );

    let payload = current_edit_mode_payload(&state)?;
    app.emit("edit-mode-changed", &payload)
        .map_err(|error| error.to_string())?;
    Ok(payload)
}

#[tauri::command]
pub fn set_overlay_window_shortcut(
    app: AppHandle,
    state: State<'_, EditModeState>,
    shortcut: String,
) -> Result<ShortcutChanged, String> {
    let next_binding = parse_shortcut_binding(&shortcut)?;
    ensure_shortcut_available(&state, &next_binding, ShortcutKind::OverlayWindow)?;
    let previous_binding = {
        let mut current = state
            .overlay_shortcut
            .lock()
            .map_err(|error| error.to_string())?;
        let previous = current.clone();
        *current = next_binding.clone();
        previous
    };

    app.global_shortcut()
        .unregister(previous_binding.shortcut)
        .map_err(|error| error.to_string())?;
    app.global_shortcut()
        .register(next_binding.shortcut)
        .map_err(|error| error.to_string())?;

    tracing::info!(
        target: "drift::window",
        previous_shortcut = %previous_binding.label,
        shortcut = %next_binding.label,
        "overlay window shortcut updated"
    );

    Ok(ShortcutChanged {
        shortcut: next_binding.label,
    })
}

#[tauri::command]
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

#[tauri::command]
pub fn load_window_layout(app: AppHandle) -> Result<Option<WindowLayout>, String> {
    read_window_layout(&app)
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    restore_window_layout(app.handle());
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
    register_global_shortcuts(app, &configured_shortcuts)?;
    Ok(())
}

fn register_global_shortcuts(
    app: &mut App,
    shortcuts: &app_config::ShortcutConfig,
) -> Result<(), Box<dyn std::error::Error>> {
    let edit_binding = parse_shortcut_binding(&shortcuts.toggle_edit_mode)?;
    let mut overlay_binding = parse_shortcut_binding(&shortcuts.toggle_overlay_window)?;
    if edit_binding.shortcut == overlay_binding.shortcut {
        tracing::warn!(
            target: "drift::window",
            shortcut = %overlay_binding.label,
            "overlay shortcut conflicts with edit mode shortcut; using default overlay shortcut"
        );
        overlay_binding = default_overlay_shortcut_binding();
    }
    {
        let state = app.state::<EditModeState>();
        let mut current = state.shortcut.lock().map_err(|error| error.to_string())?;
        *current = edit_binding.clone();
        let mut overlay_current = state
            .overlay_shortcut
            .lock()
            .map_err(|error| error.to_string())?;
        *overlay_current = overlay_binding.clone();
    }

    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, triggered_shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }

                let state = app.state::<EditModeState>();
                let shortcut_kind = match current_shortcut_kind(&state, triggered_shortcut) {
                    Ok(kind) => kind,
                    Err(error) => {
                        tracing::error!(
                            target: "drift::window",
                            error = %error,
                            "failed to detect triggered shortcut"
                        );
                        return;
                    }
                };

                match shortcut_kind {
                    Some(ShortcutKind::EditMode) => {
                        let next_enabled = match state.enabled.lock() {
                            Ok(enabled) => !*enabled,
                            Err(error) => {
                                tracing::error!(
                                    target: "drift::window",
                                    error = %error,
                                    "failed to lock edit mode state"
                                );
                                return;
                            }
                        };

                        if let Err(error) = apply_edit_mode(app, &state, next_enabled) {
                            tracing::error!(
                                target: "drift::window",
                                error = %error,
                                "failed to toggle edit mode from shortcut"
                            );
                        }
                    }
                    Some(ShortcutKind::OverlayWindow) => {
                        if let Err(error) = toggle_overlay_window(app) {
                            tracing::error!(
                                target: "drift::window",
                                error = %error,
                                "failed to toggle overlay window from shortcut"
                            );
                        }
                    }
                    None => {}
                }
            })
            .build(),
    )?;

    app.global_shortcut().register(edit_binding.shortcut)?;
    app.global_shortcut().register(overlay_binding.shortcut)?;
    tracing::info!(
        target: "drift::window",
        shortcut = %edit_binding.label,
        "edit mode shortcut registered"
    );
    tracing::info!(
        target: "drift::window",
        shortcut = %overlay_binding.label,
        "overlay window shortcut registered"
    );
    Ok(())
}

fn default_shortcut_binding() -> ShortcutBinding {
    parse_shortcut_binding(shortcut_label()).expect("default shortcut should be valid")
}

fn default_overlay_shortcut_binding() -> ShortcutBinding {
    parse_shortcut_binding(overlay_shortcut_label()).expect("default shortcut should be valid")
}

fn parse_shortcut_binding(label: &str) -> Result<ShortcutBinding, String> {
    let parts = label
        .split('+')
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();

    if parts.len() < 2 {
        return Err("快捷键格式应类似 Command+Option+K 或 Control+Alt+K".to_string());
    }

    let mut modifiers = Modifiers::empty();
    let mut key = None;
    let mut normalized_parts = Vec::new();

    for part in parts {
        let normalized = part.to_ascii_lowercase();
        match normalized.as_str() {
            "command" | "cmd" | "super" | "meta" => {
                modifiers |= Modifiers::SUPER;
                normalized_parts.push("Command".to_string());
            }
            "control" | "ctrl" => {
                modifiers |= Modifiers::CONTROL;
                normalized_parts.push("Control".to_string());
            }
            "option" | "alt" => {
                modifiers |= Modifiers::ALT;
                normalized_parts.push(if cfg!(target_os = "macos") {
                    "Option".to_string()
                } else {
                    "Alt".to_string()
                });
            }
            "shift" => {
                modifiers |= Modifiers::SHIFT;
                normalized_parts.push("Shift".to_string());
            }
            value if value.len() == 1 => {
                let character = value
                    .chars()
                    .next()
                    .ok_or_else(|| "快捷键按键为空".to_string())?;
                key = Some(letter_to_code(character)?);
                normalized_parts.push(character.to_ascii_uppercase().to_string());
            }
            _ => return Err(format!("暂不支持快捷键片段：{}", part)),
        }
    }

    let key = key.ok_or_else(|| "快捷键缺少主按键".to_string())?;
    if modifiers.is_empty() {
        return Err("快捷键至少需要一个修饰键".to_string());
    }

    Ok(ShortcutBinding {
        label: normalized_parts.join("+"),
        shortcut: Shortcut::new(Some(modifiers), key),
    })
}

fn ensure_shortcut_available(
    state: &State<'_, EditModeState>,
    binding: &ShortcutBinding,
    kind: ShortcutKind,
) -> Result<(), String> {
    let conflicts = match kind {
        ShortcutKind::EditMode => {
            let overlay = state
                .overlay_shortcut
                .lock()
                .map_err(|error| error.to_string())?;
            binding.shortcut == overlay.shortcut
        }
        ShortcutKind::OverlayWindow => {
            let edit = state.shortcut.lock().map_err(|error| error.to_string())?;
            binding.shortcut == edit.shortcut
        }
    };

    if conflicts {
        return Err("该快捷键已被 Drift 的其他功能使用".to_string());
    }

    Ok(())
}

fn current_shortcut_kind(
    state: &State<'_, EditModeState>,
    triggered_shortcut: &Shortcut,
) -> Result<Option<ShortcutKind>, String> {
    let edit = state.shortcut.lock().map_err(|error| error.to_string())?;
    if triggered_shortcut == &edit.shortcut {
        return Ok(Some(ShortcutKind::EditMode));
    }
    drop(edit);

    let overlay = state
        .overlay_shortcut
        .lock()
        .map_err(|error| error.to_string())?;
    if triggered_shortcut == &overlay.shortcut {
        return Ok(Some(ShortcutKind::OverlayWindow));
    }

    Ok(None)
}

fn letter_to_code(character: char) -> Result<Code, String> {
    match character.to_ascii_uppercase() {
        'A' => Ok(Code::KeyA),
        'B' => Ok(Code::KeyB),
        'C' => Ok(Code::KeyC),
        'D' => Ok(Code::KeyD),
        'E' => Ok(Code::KeyE),
        'F' => Ok(Code::KeyF),
        'G' => Ok(Code::KeyG),
        'H' => Ok(Code::KeyH),
        'I' => Ok(Code::KeyI),
        'J' => Ok(Code::KeyJ),
        'K' => Ok(Code::KeyK),
        'L' => Ok(Code::KeyL),
        'M' => Ok(Code::KeyM),
        'N' => Ok(Code::KeyN),
        'O' => Ok(Code::KeyO),
        'P' => Ok(Code::KeyP),
        'Q' => Ok(Code::KeyQ),
        'R' => Ok(Code::KeyR),
        'S' => Ok(Code::KeyS),
        'T' => Ok(Code::KeyT),
        'U' => Ok(Code::KeyU),
        'V' => Ok(Code::KeyV),
        'W' => Ok(Code::KeyW),
        'X' => Ok(Code::KeyX),
        'Y' => Ok(Code::KeyY),
        'Z' => Ok(Code::KeyZ),
        _ => Err("快捷键主按键目前仅支持 A-Z".to_string()),
    }
}

fn shortcut_label() -> &'static str {
    if cfg!(target_os = "macos") {
        "Command+Option+K"
    } else {
        "Control+Alt+K"
    }
}

fn overlay_shortcut_label() -> &'static str {
    if cfg!(target_os = "macos") {
        "Command+Option+J"
    } else {
        "Control+Alt+J"
    }
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
        if let Err(error) = save_window_layout(app.clone()) {
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

fn current_edit_mode_payload(state: &State<'_, EditModeState>) -> Result<EditModeChanged, String> {
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

fn toggle_overlay_window(app: &AppHandle) -> Result<(), String> {
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

fn restore_window_layout(app: &AppHandle) {
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
