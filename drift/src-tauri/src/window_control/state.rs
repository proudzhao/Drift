use std::sync::Mutex;

use tauri_plugin_global_shortcut::Shortcut;

use super::shortcuts::{
    default_overlay_shortcut_binding, default_send_shortcut_binding, default_shortcut_binding,
};

pub struct EditModeState {
    pub(super) enabled: Mutex<bool>,
    pub(super) shortcut: Mutex<ShortcutBinding>,
    pub(super) overlay_shortcut: Mutex<ShortcutBinding>,
    pub(super) send_shortcut: Mutex<ShortcutBinding>,
    pub(super) send_drag: Mutex<Option<SendWindowDrag>>,
}

impl Default for EditModeState {
    fn default() -> Self {
        Self {
            enabled: Mutex::new(false),
            shortcut: Mutex::new(default_shortcut_binding()),
            overlay_shortcut: Mutex::new(default_overlay_shortcut_binding()),
            send_shortcut: Mutex::new(default_send_shortcut_binding()),
            send_drag: Mutex::new(None),
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct ShortcutBinding {
    pub(super) label: String,
    pub(super) shortcut: Shortcut,
}

#[derive(Debug, Clone)]
pub(super) struct SendWindowDrag {
    pub(super) origin_mouse_x: f64,
    pub(super) origin_mouse_y: f64,
    pub(super) origin_window_x: i32,
    pub(super) origin_window_y: i32,
    pub(super) scale_factor: f64,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(super) enum ShortcutKind {
    EditMode,
    OverlayWindow,
    SendDanmaku,
}
