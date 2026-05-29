use std::fs;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const APP_CONFIG_FILE: &str = "app-config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    pub room_id: String,
    pub saved_rooms: Vec<SavedRoom>,
    pub auth: AuthConfig,
    pub update: UpdateConfig,
    pub appearance: AppearanceConfig,
    pub message_display: MessageDisplayConfig,
    pub filter: FilterConfig,
    pub shortcuts: ShortcutConfig,
    pub mock_panel_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SavedRoom {
    pub id: String,
    pub room_id: String,
    pub display_name: String,
    pub anchor_name: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct AuthConfig {
    pub enabled: bool,
    pub last_login_uid: Option<u64>,
    pub last_login_name: Option<String>,
    pub last_validated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UpdateConfig {
    pub check_on_startup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppearanceConfig {
    pub font_size: u32,
    pub opacity: f64,
    pub scroll_duration: f64,
    pub density: String,
    pub show_username: bool,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MessageDisplayConfig {
    pub show_danmaku: bool,
    pub show_gift: bool,
    pub show_guard: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct FilterConfig {
    pub blocked_words: Vec<String>,
    pub rules: Vec<FilterRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct FilterRule {
    pub id: String,
    pub enabled: bool,
    pub name: String,
    pub target: String,
    pub operator: String,
    pub value: String,
    pub action: String,
}

impl Default for FilterRule {
    fn default() -> Self {
        Self {
            id: String::new(),
            enabled: true,
            name: String::new(),
            target: "text".to_string(),
            operator: "contains".to_string(),
            value: String::new(),
            action: "hide".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ShortcutConfig {
    pub toggle_edit_mode: String,
    pub toggle_overlay_window: String,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            font_size: 20,
            opacity: 0.94,
            scroll_duration: 12.0,
            density: "medium".to_string(),
            show_username: false,
            color: "white".to_string(),
        }
    }
}

impl Default for MessageDisplayConfig {
    fn default() -> Self {
        Self {
            show_danmaku: true,
            show_gift: true,
            show_guard: true,
        }
    }
}

impl Default for UpdateConfig {
    fn default() -> Self {
        Self {
            check_on_startup: true,
        }
    }
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        Self {
            toggle_edit_mode: shortcut_label().to_string(),
            toggle_overlay_window: overlay_shortcut_label().to_string(),
        }
    }
}

impl Default for SavedRoom {
    fn default() -> Self {
        Self {
            id: String::new(),
            room_id: String::new(),
            display_name: String::new(),
            anchor_name: None,
            updated_at: String::new(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            room_id: String::new(),
            saved_rooms: Vec::new(),
            auth: AuthConfig::default(),
            update: UpdateConfig::default(),
            appearance: AppearanceConfig::default(),
            message_display: MessageDisplayConfig::default(),
            filter: FilterConfig::default(),
            shortcuts: ShortcutConfig::default(),
            mock_panel_enabled: false,
        }
    }
}

#[tauri::command]
pub fn load_app_config(app: AppHandle) -> Result<AppConfig, String> {
    read_app_config(&app)
}

#[tauri::command]
pub fn save_app_config(app: AppHandle, config: AppConfig) -> Result<AppConfig, String> {
    write_app_config(&app, &config)?;
    app.emit("app-config-changed", &config)
        .map_err(|error| error.to_string())?;
    tracing::info!(
        target: "drift::config",
        room_id = %config.room_id,
        font_size = config.appearance.font_size,
        opacity = config.appearance.opacity,
        density = %config.appearance.density,
        show_username = config.appearance.show_username,
        "app config saved"
    );
    Ok(config)
}

pub fn read_app_config(app: &AppHandle) -> Result<AppConfig, String> {
    let path = app_config_path(app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let mut config: AppConfig =
        serde_json::from_str(&content).map_err(|error| error.to_string())?;
    if config.shortcuts.toggle_edit_mode == legacy_shortcut_label() {
        config.shortcuts.toggle_edit_mode = shortcut_label().to_string();
    }
    if config.shortcuts.toggle_overlay_window.is_empty() {
        config.shortcuts.toggle_overlay_window = overlay_shortcut_label().to_string();
    }
    Ok(config)
}

pub fn update_auth_config(app: &AppHandle, auth: AuthConfig) -> Result<AppConfig, String> {
    let mut config = read_app_config(app)?;
    config.auth = auth;
    write_app_config(app, &config)?;
    app.emit("app-config-changed", &config)
        .map_err(|error| error.to_string())?;
    Ok(config)
}

fn write_app_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = app_config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let content = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn app_config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(APP_CONFIG_FILE))
        .map_err(|error| error.to_string())
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

fn legacy_shortcut_label() -> &'static str {
    if cfg!(target_os = "macos") {
        "Command+Option+D"
    } else {
        "Control+Alt+D"
    }
}
