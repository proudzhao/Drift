use std::fs;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const APP_CONFIG_FILE: &str = "app-config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    pub room_id: String,
    pub appearance: AppearanceConfig,
    pub filter: FilterConfig,
    pub shortcuts: ShortcutConfig,
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct FilterConfig {
    pub blocked_words: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ShortcutConfig {
    pub toggle_edit_mode: String,
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

impl Default for ShortcutConfig {
    fn default() -> Self {
        Self {
            toggle_edit_mode: shortcut_label().to_string(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            room_id: String::new(),
            appearance: AppearanceConfig::default(),
            filter: FilterConfig::default(),
            shortcuts: ShortcutConfig::default(),
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

fn legacy_shortcut_label() -> &'static str {
    if cfg!(target_os = "macos") {
        "Command+Option+D"
    } else {
        "Control+Alt+D"
    }
}
