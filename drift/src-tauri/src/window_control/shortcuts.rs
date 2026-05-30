use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::app_config;

use super::{
    edit_mode::{
        current_edit_mode_payload, toggle_edit_mode, toggle_overlay_window, EditModeChanged,
    },
    send_window::show_send_danmaku_window,
    state::{EditModeState, ShortcutBinding, ShortcutKind},
};

#[derive(Debug, Clone, Serialize)]
pub struct ShortcutChanged {
    pub shortcut: String,
}

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

pub fn set_send_danmaku_shortcut(
    app: AppHandle,
    state: State<'_, EditModeState>,
    shortcut: String,
) -> Result<ShortcutChanged, String> {
    let next_binding = parse_shortcut_binding(&shortcut)?;
    ensure_shortcut_available(&state, &next_binding, ShortcutKind::SendDanmaku)?;
    let previous_binding = {
        let mut current = state
            .send_shortcut
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
        "send danmaku shortcut updated"
    );

    Ok(ShortcutChanged {
        shortcut: next_binding.label,
    })
}

pub(super) fn register_global_shortcuts(
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
    let mut send_binding = parse_shortcut_binding(&shortcuts.open_send_danmaku)?;
    if send_binding.shortcut == edit_binding.shortcut
        || send_binding.shortcut == overlay_binding.shortcut
    {
        tracing::warn!(
            target: "drift::window",
            shortcut = %send_binding.label,
            "send danmaku shortcut conflicts with another shortcut; using default send shortcut"
        );
        send_binding = first_available_send_shortcut_binding(&[
            edit_binding.shortcut,
            overlay_binding.shortcut,
        ]);
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
        let mut send_current = state
            .send_shortcut
            .lock()
            .map_err(|error| error.to_string())?;
        *send_current = send_binding.clone();
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
                        if let Err(error) = toggle_edit_mode(app, &state) {
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
                    Some(ShortcutKind::SendDanmaku) => {
                        if let Err(error) = show_send_danmaku_window(app) {
                            tracing::error!(
                                target: "drift::window",
                                error = %error,
                                "failed to open send danmaku window from shortcut"
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
    app.global_shortcut().register(send_binding.shortcut)?;
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
    tracing::info!(
        target: "drift::window",
        shortcut = %send_binding.label,
        "send danmaku shortcut registered"
    );
    Ok(())
}

pub(super) fn default_shortcut_binding() -> ShortcutBinding {
    parse_shortcut_binding(shortcut_label()).expect("default shortcut should be valid")
}

pub(super) fn default_overlay_shortcut_binding() -> ShortcutBinding {
    parse_shortcut_binding(overlay_shortcut_label()).expect("default shortcut should be valid")
}

pub(super) fn default_send_shortcut_binding() -> ShortcutBinding {
    parse_shortcut_binding(send_danmaku_shortcut_label()).expect("default shortcut should be valid")
}

fn first_available_send_shortcut_binding(occupied: &[Shortcut]) -> ShortcutBinding {
    send_danmaku_shortcut_candidates()
        .iter()
        .map(|label| {
            parse_shortcut_binding(label).expect("send shortcut candidate should be valid")
        })
        .find(|binding| {
            occupied
                .iter()
                .all(|shortcut| shortcut != &binding.shortcut)
        })
        .unwrap_or_else(default_send_shortcut_binding)
}

fn parse_shortcut_binding(label: &str) -> Result<ShortcutBinding, String> {
    let parts = label
        .split('+')
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();

    if parts.len() < 2 {
        return Err("快捷键格式应类似 Command+Option+K 或 Control+Alt+Enter".to_string());
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
            "enter" | "return" => {
                key = Some(Code::Enter);
                normalized_parts.push("Enter".to_string());
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
            let send = state
                .send_shortcut
                .lock()
                .map_err(|error| error.to_string())?;
            binding.shortcut == overlay.shortcut || binding.shortcut == send.shortcut
        }
        ShortcutKind::OverlayWindow => {
            let edit = state.shortcut.lock().map_err(|error| error.to_string())?;
            let send = state
                .send_shortcut
                .lock()
                .map_err(|error| error.to_string())?;
            binding.shortcut == edit.shortcut || binding.shortcut == send.shortcut
        }
        ShortcutKind::SendDanmaku => {
            let edit = state.shortcut.lock().map_err(|error| error.to_string())?;
            let overlay = state
                .overlay_shortcut
                .lock()
                .map_err(|error| error.to_string())?;
            binding.shortcut == edit.shortcut || binding.shortcut == overlay.shortcut
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
    drop(overlay);

    let send = state
        .send_shortcut
        .lock()
        .map_err(|error| error.to_string())?;
    if triggered_shortcut == &send.shortcut {
        return Ok(Some(ShortcutKind::SendDanmaku));
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

fn send_danmaku_shortcut_label() -> &'static str {
    if cfg!(target_os = "macos") {
        "Command+Option+Enter"
    } else {
        "Control+Alt+Enter"
    }
}

fn send_danmaku_shortcut_candidates() -> [&'static str; 3] {
    if cfg!(target_os = "macos") {
        [
            "Command+Option+Enter",
            "Command+Option+L",
            "Command+Option+M",
        ]
    } else {
        ["Control+Alt+Enter", "Control+Alt+L", "Control+Alt+M"]
    }
}
