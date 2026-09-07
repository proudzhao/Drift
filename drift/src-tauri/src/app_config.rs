use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const APP_CONFIG_FILE: &str = "app-config.json";
const MAX_SELECTED_ROOMS: usize = 5;
const UNGROUPED_SAVED_ROOM_GROUP_ID: &str = "uncategorized";
const DEPRECATED_FILTER_TARGETS: [&str; 4] =
    ["commentText", "messageType", "giftName", "guardLevel"];
static APP_CONFIG_WRITE_GATE: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    pub room_id: String,
    pub saved_room_groups: Vec<SavedRoomGroup>,
    pub saved_rooms: Vec<SavedRoom>,
    pub selected_saved_room_ids: Vec<String>,
    pub send: SendConfig,
    pub auth: AuthConfig,
    pub update: UpdateConfig,
    pub recording: RecordingConfig,
    pub appearance: AppearanceConfig,
    pub message_display: MessageDisplayConfig,
    pub filter: FilterConfig,
    pub shortcuts: ShortcutConfig,
    pub mock_panel_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SavedRoomGroup {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRoom {
    pub id: String,
    pub room_id: String,
    pub display_name: String,
    pub anchor_name: Option<String>,
    pub group_id: String,
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
pub struct RecordingConfig {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct SendConfig {
    pub last_room_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppearanceConfig {
    pub font_size: u32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_ui_theme")]
    pub theme: String,
    pub opacity: f64,
    pub scroll_duration: f64,
    pub density: String,
    pub show_username: bool,
    pub color: String,
    pub message_flow: String,
    pub vertical_overflow_policy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MessageDisplayConfig {
    pub show_danmaku: bool,
    #[serde(default = "default_true")]
    pub show_emotes: bool,
    pub show_gift: bool,
    pub show_guard: bool,
    #[serde(default = "default_true")]
    pub show_super_chat: bool,
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
    pub open_send_danmaku: String,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            font_size: 20,
            font_family: default_font_family(),
            theme: default_ui_theme(),
            opacity: 0.94,
            scroll_duration: 12.0,
            density: "high".to_string(),
            show_username: false,
            color: "white".to_string(),
            message_flow: "horizontal".to_string(),
            vertical_overflow_policy: "realtime".to_string(),
        }
    }
}

impl Default for MessageDisplayConfig {
    fn default() -> Self {
        Self {
            show_danmaku: true,
            show_emotes: true,
            show_gift: true,
            show_guard: true,
            show_super_chat: true,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_font_family() -> String {
    "system".to_string()
}

fn default_ui_theme() -> String {
    "dark".to_string()
}

impl Default for UpdateConfig {
    fn default() -> Self {
        Self {
            check_on_startup: true,
        }
    }
}

impl Default for RecordingConfig {
    fn default() -> Self {
        Self { enabled: false }
    }
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        Self {
            toggle_edit_mode: shortcut_label().to_string(),
            toggle_overlay_window: overlay_shortcut_label().to_string(),
            open_send_danmaku: send_danmaku_shortcut_label().to_string(),
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
            group_id: UNGROUPED_SAVED_ROOM_GROUP_ID.to_string(),
            updated_at: String::new(),
        }
    }
}

impl<'de> Deserialize<'de> for SavedRoom {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(default, rename_all = "camelCase")]
        struct SavedRoomWire {
            id: String,
            room_id: String,
            display_name: String,
            anchor_name: Option<String>,
            group_id: String,
            #[serde(rename = "group")]
            legacy_group: Option<String>,
            updated_at: String,
        }

        impl Default for SavedRoomWire {
            fn default() -> Self {
                let saved_room = SavedRoom::default();
                Self {
                    id: saved_room.id,
                    room_id: saved_room.room_id,
                    display_name: saved_room.display_name,
                    anchor_name: saved_room.anchor_name,
                    group_id: String::new(),
                    legacy_group: None,
                    updated_at: saved_room.updated_at,
                }
            }
        }

        let wire = SavedRoomWire::deserialize(deserializer)?;
        let group_id = if wire.group_id.trim().is_empty() {
            map_legacy_saved_room_group(wire.legacy_group.as_deref())
                .unwrap_or(UNGROUPED_SAVED_ROOM_GROUP_ID)
                .to_string()
        } else {
            wire.group_id
        };

        Ok(Self {
            id: wire.id,
            room_id: wire.room_id,
            display_name: wire.display_name,
            anchor_name: wire.anchor_name,
            group_id,
            updated_at: wire.updated_at,
        })
    }
}

impl Default for SavedRoomGroup {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            room_id: String::new(),
            saved_room_groups: default_saved_room_groups(),
            saved_rooms: Vec::new(),
            selected_saved_room_ids: Vec::new(),
            send: SendConfig::default(),
            auth: AuthConfig::default(),
            update: UpdateConfig::default(),
            recording: RecordingConfig::default(),
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
    let config = update_app_config_atomically(&app, move |current, latest| {
        *current = config;
        preserve_authority_owned_sections(current, latest);
    })?;
    tracing::info!(
        target: "drift::config",
        room_id = %config.room_id,
        font_size = config.appearance.font_size,
        font_family = %config.appearance.font_family,
        opacity = config.appearance.opacity,
        density = %config.appearance.density,
        show_username = config.appearance.show_username,
        "app config saved"
    );
    Ok(config)
}

#[tauri::command]
pub fn set_last_send_room_id(app: AppHandle, room_id: Option<u64>) -> Result<AppConfig, String> {
    update_app_config_atomically(&app, move |config, _| {
        config.send.last_room_id = room_id.map(|value| value.to_string());
    })
}

pub fn read_app_config(app: &AppHandle) -> Result<AppConfig, String> {
    let path = app_config_path(app)?;
    let mut config = read_app_config_from_path(&path)?;
    let removed_filter_rule_count = normalize_loaded_app_config(&mut config);
    if removed_filter_rule_count > 0 {
        if let Err(error) = persist_normalized_config_to_path_if_needed(&path) {
            tracing::warn!(
                target: "drift::config",
                removed_filter_rule_count,
                error = %error,
                "failed to persist deprecated filter rule removal; using normalized in-memory config"
            );
        }
    }
    Ok(config)
}

pub fn update_auth_config(app: &AppHandle, auth: AuthConfig) -> Result<AppConfig, String> {
    update_app_config_atomically(app, move |config, _| {
        config.auth = auth;
    })
}

pub fn update_recording_enabled_config(
    app: &AppHandle,
    enabled: bool,
) -> Result<AppConfig, String> {
    update_app_config_atomically(app, move |config, _| {
        config.recording.enabled = enabled;
    })
}

fn app_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(APP_CONFIG_FILE))
        .map_err(|error| error.to_string())
}

fn update_app_config_atomically<F>(app: &AppHandle, mutate: F) -> Result<AppConfig, String>
where
    F: FnOnce(&mut AppConfig, &AppConfig),
{
    let path = app_config_path(app)?;
    update_app_config_path_atomically(&path, mutate, |config| {
        app.emit("app-config-changed", config)
            .map_err(|error| error.to_string())
    })
}

fn update_app_config_path_atomically<F, E>(
    path: &Path,
    mutate: F,
    emit: E,
) -> Result<AppConfig, String>
where
    F: FnOnce(&mut AppConfig, &AppConfig),
    E: FnOnce(&AppConfig) -> Result<(), String>,
{
    let _guard = APP_CONFIG_WRITE_GATE
        .lock()
        .map_err(|error| format!("配置写入锁获取失败：{error}"))?;
    let mut config = read_app_config_from_path(path)?;
    let latest = config.clone();
    mutate(&mut config, &latest);
    let _ = normalize_loaded_app_config(&mut config);
    write_app_config_to_path(path, &config)?;
    emit(&config)?;
    Ok(config)
}

fn read_app_config_from_path(path: &Path) -> Result<AppConfig, String> {
    if !path.exists() {
        let mut config = AppConfig::default();
        let _ = normalize_loaded_app_config(&mut config);
        return Ok(config);
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn persist_normalized_config_to_path_if_needed(path: &Path) -> Result<(), String> {
    let _guard = APP_CONFIG_WRITE_GATE
        .lock()
        .map_err(|error| format!("配置写入锁获取失败：{error}"))?;
    if !path.exists() {
        return Ok(());
    }

    let mut config = read_app_config_from_path(path)?;
    if normalize_loaded_app_config(&mut config) == 0 {
        return Ok(());
    }
    write_app_config_to_path(path, &config)
}

fn write_app_config_to_path(path: &Path, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let content = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn preserve_authority_owned_sections(config: &mut AppConfig, latest: &AppConfig) {
    config.send = latest.send.clone();
    config.auth = latest.auth.clone();
    config.recording = latest.recording.clone();
}

fn normalize_loaded_app_config(config: &mut AppConfig) -> usize {
    if config.shortcuts.toggle_edit_mode == legacy_shortcut_label() {
        config.shortcuts.toggle_edit_mode = shortcut_label().to_string();
    }
    if config.shortcuts.toggle_overlay_window.is_empty() {
        config.shortcuts.toggle_overlay_window = overlay_shortcut_label().to_string();
    }
    if config.shortcuts.open_send_danmaku.is_empty() {
        config.shortcuts.open_send_danmaku = send_danmaku_shortcut_label().to_string();
    }
    normalize_app_config(config)
}

fn normalize_app_config(config: &mut AppConfig) -> usize {
    if config.appearance.font_family.trim().is_empty() {
        config.appearance.font_family = default_font_family();
    }

    if !matches!(config.appearance.theme.as_str(), "dark" | "light") {
        config.appearance.theme = default_ui_theme();
    }

    if !matches!(
        config.appearance.message_flow.as_str(),
        "horizontal" | "vertical"
    ) {
        config.appearance.message_flow = "horizontal".to_string();
    }

    if !matches!(
        config.appearance.vertical_overflow_policy.as_str(),
        "realtime" | "complete"
    ) {
        config.appearance.vertical_overflow_policy = "realtime".to_string();
    }

    normalize_saved_room_groups(&mut config.saved_room_groups);
    let valid_group_ids: HashSet<String> = config
        .saved_room_groups
        .iter()
        .map(|group| group.id.clone())
        .collect();

    for room in &mut config.saved_rooms {
        let group_id = room.group_id.trim().to_string();
        room.group_id = if valid_group_ids.contains(&group_id) {
            group_id
        } else {
            UNGROUPED_SAVED_ROOM_GROUP_ID.to_string()
        };
    }

    let valid_saved_room_ids: HashSet<&str> = config
        .saved_rooms
        .iter()
        .filter(|room| !room.id.trim().is_empty())
        .map(|room| room.id.as_str())
        .collect();
    let mut seen_saved_room_ids = HashSet::new();
    config.selected_saved_room_ids.retain(|id| {
        !id.trim().is_empty()
            && valid_saved_room_ids.contains(id.as_str())
            && seen_saved_room_ids.insert(id.clone())
            && seen_saved_room_ids.len() <= MAX_SELECTED_ROOMS
    });

    if config
        .send
        .last_room_id
        .as_deref()
        .is_some_and(|room_id| !is_positive_room_id(room_id))
    {
        config.send.last_room_id = None;
    }

    let original_rule_count = config.filter.rules.len();
    config
        .filter
        .rules
        .retain(|rule| !DEPRECATED_FILTER_TARGETS.contains(&rule.target.as_str()));
    original_rule_count - config.filter.rules.len()
}

fn is_positive_room_id(value: &str) -> bool {
    let mut bytes = value.bytes();
    matches!(bytes.next(), Some(b'1'..=b'9')) && bytes.all(|byte| byte.is_ascii_digit())
}

fn normalize_saved_room_groups(saved_room_groups: &mut Vec<SavedRoomGroup>) {
    for group in saved_room_groups.iter_mut() {
        group.id = group.id.trim().to_string();
        group.name = group.name.trim().to_string();
    }

    saved_room_groups.retain(|group| {
        !group.id.is_empty() && !group.name.is_empty() && group.id != UNGROUPED_SAVED_ROOM_GROUP_ID
    });

    let mut seen_group_ids = HashSet::new();
    saved_room_groups.retain(|group| seen_group_ids.insert(group.id.clone()));

    if saved_room_groups.is_empty() {
        *saved_room_groups = default_saved_room_groups();
    }
}

fn default_saved_room_groups() -> Vec<SavedRoomGroup> {
    [
        ("vtuber", "VTuber"),
        ("game", "游戏"),
        ("chat", "聊天"),
        ("event", "赛事"),
    ]
    .into_iter()
    .map(|(id, name)| SavedRoomGroup {
        id: id.to_string(),
        name: name.to_string(),
        created_at: String::new(),
        updated_at: String::new(),
    })
    .collect()
}

fn map_legacy_saved_room_group(group: Option<&str>) -> Option<&'static str> {
    match group {
        Some("favorite") => Some(UNGROUPED_SAVED_ROOM_GROUP_ID),
        Some("event") => Some("event"),
        Some("study") => Some("chat"),
        Some("entertainment") => Some("game"),
        _ => None,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::{Arc, Barrier, Mutex};
    use std::thread;
    use tempfile::tempdir;

    fn test_config_path() -> std::path::PathBuf {
        tempdir().expect("tempdir").keep().join(APP_CONFIG_FILE)
    }

    #[test]
    fn old_config_defaults_recording_to_disabled() {
        let config: AppConfig = serde_json::from_value(json!({ "roomId": "6" })).expect("config");

        assert!(!config.recording.enabled);
    }

    #[test]
    fn explicit_recording_enabled_is_preserved() {
        let config: AppConfig = serde_json::from_value(json!({
            "recording": { "enabled": true }
        }))
        .expect("config");

        assert!(config.recording.enabled);
    }

    #[test]
    fn atomic_save_preserves_latest_authority_owned_sections() {
        let path = test_config_path();
        let mut latest = AppConfig::default();
        latest.send.last_room_id = Some("7".to_string());
        latest.auth = AuthConfig {
            enabled: true,
            last_login_uid: Some(42),
            last_login_name: Some("测试账号".to_string()),
            last_validated_at: Some(123),
        };
        latest.recording.enabled = true;
        write_app_config_to_path(&path, &latest).expect("write latest");

        let mut stale = AppConfig::default();
        stale.appearance.theme = "light".to_string();
        stale.room_id = "999".to_string();
        stale.send.last_room_id = Some("1".to_string());
        stale.auth.enabled = false;
        stale.recording.enabled = false;

        let saved = update_app_config_path_atomically(
            &path,
            move |config, current| {
                *config = stale.clone();
                preserve_authority_owned_sections(config, current);
            },
            |_| Ok(()),
        )
        .expect("atomic save");

        assert_eq!(saved.room_id, "999");
        assert_eq!(saved.appearance.theme, "light");
        assert_eq!(saved.send.last_room_id.as_deref(), Some("7"));
        assert!(saved.auth.enabled);
        assert_eq!(saved.auth.last_login_uid, Some(42));
        assert!(saved.recording.enabled);
    }

    #[test]
    fn atomic_updates_serialize_and_keep_latest_changes() {
        let path = Arc::new(test_config_path());
        write_app_config_to_path(path.as_ref(), &AppConfig::default()).expect("write default");

        let barrier = Arc::new(Barrier::new(3));
        let emitted = Arc::new(Mutex::new(Vec::<AppConfig>::new()));

        let send_path = Arc::clone(&path);
        let send_barrier = Arc::clone(&barrier);
        let send_emitted = Arc::clone(&emitted);
        let send_thread = thread::spawn(move || {
            send_barrier.wait();
            update_app_config_path_atomically(
                send_path.as_ref(),
                |config, _| {
                    config.send.last_room_id = Some("6".to_string());
                },
                |config| {
                    send_emitted.lock().expect("emit lock").push(config.clone());
                    Ok(())
                },
            )
            .expect("send update");
        });

        let auth_path = Arc::clone(&path);
        let auth_barrier = Arc::clone(&barrier);
        let auth_emitted = Arc::clone(&emitted);
        let auth_thread = thread::spawn(move || {
            auth_barrier.wait();
            update_app_config_path_atomically(
                auth_path.as_ref(),
                |config, _| {
                    config.auth.enabled = true;
                    config.auth.last_login_uid = Some(99);
                },
                |config| {
                    auth_emitted.lock().expect("emit lock").push(config.clone());
                    Ok(())
                },
            )
            .expect("auth update");
        });

        barrier.wait();
        send_thread.join().expect("send join");
        auth_thread.join().expect("auth join");

        let final_config = read_app_config_from_path(path.as_ref()).expect("read final");
        let emitted = emitted.lock().expect("emit read");

        assert_eq!(emitted.len(), 2);
        assert_eq!(final_config.send.last_room_id.as_deref(), Some("6"));
        assert!(final_config.auth.enabled);
        assert_eq!(final_config.auth.last_login_uid, Some(99));
        assert!(
            emitted.iter().any(|config| {
                config.send.last_room_id.as_deref() == Some("6")
                    && !config.auth.enabled
                    && config.auth.last_login_uid.is_none()
            }) || emitted.iter().any(|config| {
                config.send.last_room_id.is_none()
                    && config.auth.enabled
                    && config.auth.last_login_uid == Some(99)
            })
        );
        assert!(emitted.iter().any(|config| {
            config.send.last_room_id.as_deref() == Some("6")
                && config.auth.enabled
                && config.auth.last_login_uid == Some(99)
        }));
    }

    #[test]
    fn old_config_defaults_multi_room_selection_and_send_target_to_empty() {
        let mut config: AppConfig = serde_json::from_value(json!({
            "savedRooms": [{
                "id": "room-1",
                "roomId": "1",
                "displayName": "房间 1",
                "groupId": "uncategorized",
                "updatedAt": "2026-08-27T00:00:00.000Z"
            }]
        }))
        .expect("config");

        normalize_app_config(&mut config);

        assert!(config.selected_saved_room_ids.is_empty());
        assert!(config.send.last_room_id.is_none());
    }

    #[test]
    fn normalize_multi_room_selection_keeps_five_valid_unique_ids() {
        let mut config: AppConfig = serde_json::from_value(json!({
            "savedRooms": (1..=6).map(|index| json!({
                "id": format!("room-{index}"),
                "roomId": index.to_string(),
                "displayName": format!("房间 {index}"),
                "groupId": "uncategorized",
                "updatedAt": "2026-08-27T00:00:00.000Z"
            })).collect::<Vec<_>>(),
            "selectedSavedRoomIds": [
                "room-1", "room-1", "missing", "room-2",
                "room-3", "room-4", "room-5", "room-6"
            ],
            "send": { "lastRoomId": "123456" }
        }))
        .expect("config");

        normalize_app_config(&mut config);

        assert_eq!(
            config.selected_saved_room_ids,
            vec![
                "room-1".to_string(),
                "room-2".to_string(),
                "room-3".to_string(),
                "room-4".to_string(),
                "room-5".to_string(),
            ]
        );
        assert_eq!(config.send.last_room_id.as_deref(), Some("123456"));
    }

    #[test]
    fn normalize_multi_room_selection_drops_empty_ids_and_keeps_cap_and_dedup() {
        let mut saved_rooms = vec![
            json!({
                "id": "",
                "roomId": "100",
                "displayName": "空 ID",
                "groupId": "uncategorized",
                "updatedAt": "2026-09-05T00:00:00.000Z"
            }),
            json!({
                "id": "   ",
                "roomId": "101",
                "displayName": "空白 ID",
                "groupId": "uncategorized",
                "updatedAt": "2026-09-05T00:00:00.000Z"
            }),
        ];
        saved_rooms.extend((1..=6).map(|index| {
            json!({
                "id": format!("room-{index}"),
                "roomId": index.to_string(),
                "displayName": format!("房间 {index}"),
                "groupId": "uncategorized",
                "updatedAt": "2026-09-05T00:00:00.000Z"
            })
        }));
        let mut config: AppConfig = serde_json::from_value(json!({
            "savedRooms": saved_rooms,
            "selectedSavedRoomIds": [
                "", "   ", "room-1", "room-1", "room-2",
                "room-3", "room-4", "room-5", "room-6"
            ]
        }))
        .expect("config");

        normalize_app_config(&mut config);

        assert_eq!(
            config.selected_saved_room_ids,
            vec![
                "room-1".to_string(),
                "room-2".to_string(),
                "room-3".to_string(),
                "room-4".to_string(),
                "room-5".to_string(),
            ]
        );
    }

    #[test]
    fn normalize_multi_room_selection_drops_invalid_last_send_room_id() {
        for last_room_id in ["", "0", "-1", "1.5", "1e3", "abc"] {
            let mut config: AppConfig = serde_json::from_value(json!({
                "send": { "lastRoomId": last_room_id }
            }))
            .expect("config");

            normalize_app_config(&mut config);

            assert!(config.send.last_room_id.is_none(), "{last_room_id}");
        }
    }

    #[test]
    fn old_message_display_config_defaults_show_emotes_to_true() {
        let config: AppConfig = serde_json::from_value(json!({
            "messageDisplay": {
                "showDanmaku": true,
                "showGift": true,
                "showGuard": true
            }
        }))
        .expect("old config should deserialize");

        assert!(config.message_display.show_emotes);
    }

    #[test]
    fn old_message_display_config_defaults_show_super_chat_to_true() {
        let config: AppConfig = serde_json::from_value(json!({
            "messageDisplay": {
                "showDanmaku": true,
                "showEmotes": true,
                "showGift": true,
                "showGuard": true
            }
        }))
        .expect("old config should deserialize");

        assert!(config.message_display.show_super_chat);
    }

    #[test]
    fn explicit_show_emotes_false_is_preserved() {
        let config: AppConfig = serde_json::from_value(json!({
            "messageDisplay": {
                "showDanmaku": true,
                "showEmotes": false,
                "showGift": true,
                "showGuard": true
            }
        }))
        .expect("config should deserialize");

        assert!(!config.message_display.show_emotes);
    }

    #[test]
    fn explicit_show_super_chat_false_is_preserved() {
        let config: AppConfig = serde_json::from_value(json!({
            "messageDisplay": {
                "showDanmaku": true,
                "showEmotes": true,
                "showGift": true,
                "showGuard": true,
                "showSuperChat": false
            }
        }))
        .expect("config should deserialize");

        assert!(!config.message_display.show_super_chat);
    }

    #[test]
    fn old_appearance_config_defaults_font_family_to_system() {
        let config: AppConfig = serde_json::from_value(json!({
            "appearance": {
                "fontSize": 20,
                "opacity": 0.94,
                "scrollDuration": 12.0,
                "density": "high",
                "showUsername": false,
                "color": "white"
            }
        }))
        .expect("old config should deserialize");

        assert_eq!(config.appearance.font_family, "system");
    }

    #[test]
    fn old_config_defaults_theme_to_dark() {
        let config: AppConfig = serde_json::from_value(json!({
            "appearance": { "fontSize": 20 }
        }))
        .expect("config");

        assert_eq!(config.appearance.theme, "dark");
    }

    #[test]
    fn explicit_light_theme_is_preserved() {
        let config: AppConfig = serde_json::from_value(json!({
            "appearance": { "theme": "light" }
        }))
        .expect("config");

        assert_eq!(config.appearance.theme, "light");
    }

    #[test]
    fn normalize_app_config_resets_invalid_theme_to_dark() {
        let mut config = AppConfig::default();
        config.appearance.theme = "system".to_string();

        normalize_app_config(&mut config);

        assert_eq!(config.appearance.theme, "dark");
    }

    #[test]
    fn old_config_defaults_message_flow_to_horizontal_realtime() {
        let config: AppConfig = serde_json::from_value(json!({
            "appearance": { "fontSize": 20 }
        }))
        .expect("legacy config");

        assert_eq!(config.appearance.message_flow, "horizontal");
        assert_eq!(config.appearance.vertical_overflow_policy, "realtime");
    }

    #[test]
    fn normalize_app_config_resets_invalid_message_flow_values() {
        let mut config = AppConfig::default();
        config.appearance.message_flow = "diagonal".to_string();
        config.appearance.vertical_overflow_policy = "unbounded".to_string();

        normalize_app_config(&mut config);

        assert_eq!(config.appearance.message_flow, "horizontal");
        assert_eq!(config.appearance.vertical_overflow_policy, "realtime");
    }

    #[test]
    fn explicit_vertical_complete_mode_is_preserved() {
        let mut config: AppConfig = serde_json::from_value(json!({
            "appearance": {
                "messageFlow": "vertical",
                "verticalOverflowPolicy": "complete"
            }
        }))
        .expect("vertical config");

        normalize_app_config(&mut config);

        assert_eq!(config.appearance.message_flow, "vertical");
        assert_eq!(config.appearance.vertical_overflow_policy, "complete");
    }

    #[test]
    fn normalize_app_config_resets_empty_font_family_to_system() {
        let mut config = AppConfig::default();
        config.appearance.font_family = "   ".to_string();

        let _ = normalize_app_config(&mut config);

        assert_eq!(config.appearance.font_family, "system");
    }

    #[test]
    fn removes_deprecated_filter_targets_and_keeps_supported_rules() {
        let mut config: AppConfig = serde_json::from_value(json!({
            "filter": { "blockedWords": ["旧词"], "rules": [
                { "id": "text", "target": "text", "operator": "contains", "value": "a", "action": "hide" },
                { "id": "user", "target": "user", "operator": "equals", "value": "A", "action": "hide" },
                { "id": "uid", "target": "senderUid", "operator": "equals", "value": "42", "action": "highlight" },
                { "id": "fan", "target": "currentRoomFanMedal", "operator": "equals", "value": "no", "action": "hide" },
                { "id": "comment", "target": "commentText", "operator": "contains", "value": "b", "action": "hide" },
                { "id": "type", "enabled": false, "target": "messageType", "operator": "equals", "value": "gift", "action": "hide" },
                { "id": "gift", "target": "giftName", "operator": "equals", "value": "花", "action": "highlight" },
                { "id": "guard", "target": "guardLevel", "operator": "equals", "value": "3", "action": "hide" }
            ]}
        }))
        .expect("config");

        assert_eq!(normalize_app_config(&mut config), 4);
        assert_eq!(
            config
                .filter
                .rules
                .iter()
                .map(|rule| rule.id.as_str())
                .collect::<Vec<_>>(),
            vec!["text", "user", "uid", "fan"]
        );
        assert_eq!(config.filter.blocked_words, vec!["旧词"]);
        assert_eq!(normalize_app_config(&mut config), 0);
    }

    #[test]
    fn old_room_collection_config_defaults_to_ungrouped_room() {
        let config: AppConfig = serde_json::from_value(json!({
            "savedRooms": [
                {
                    "id": "room-1",
                    "roomId": "22625025",
                    "displayName": "旧房间",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                }
            ]
        }))
        .expect("old saved room config should deserialize");

        assert_eq!(config.saved_room_groups.len(), 4);
        assert_eq!(config.saved_room_groups[0].id, "vtuber");
        assert_eq!(
            config.saved_rooms[0].group_id,
            UNGROUPED_SAVED_ROOM_GROUP_ID
        );
    }

    #[test]
    fn old_connection_history_field_is_ignored() {
        let mut value = json!({
            "savedRooms": [],
        });
        value.as_object_mut().unwrap().insert(
            ["recent", "Rooms"].concat(),
            json!([
                {
                    "id": "old-room-history",
                    "roomId": "22625025",
                    "displayName": "旧连接记录",
                    "connectedAt": "2026-06-06T00:00:00.000Z"
                }
            ]),
        );

        let config: AppConfig =
            serde_json::from_value(value).expect("old connection history field should be ignored");

        assert!(config.saved_rooms.is_empty());
        assert_eq!(config.saved_room_groups[0].id, "vtuber");
    }

    #[test]
    fn legacy_saved_room_group_is_mapped_to_group_id() {
        let config: AppConfig = serde_json::from_value(json!({
            "savedRooms": [
                {
                    "id": "favorite-room",
                    "roomId": "1000",
                    "displayName": "常看旧房间",
                    "group": "favorite",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                },
                {
                    "id": "event-room",
                    "roomId": "1001",
                    "displayName": "活动旧房间",
                    "group": "event",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                },
                {
                    "id": "study-room",
                    "roomId": "1002",
                    "displayName": "学习旧房间",
                    "group": "study",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                },
                {
                    "id": "entertainment-room",
                    "roomId": "1003",
                    "displayName": "娱乐旧房间",
                    "group": "entertainment",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                }
            ]
        }))
        .expect("legacy saved room groups should deserialize");

        let group_ids: Vec<&str> = config
            .saved_rooms
            .iter()
            .map(|room| room.group_id.as_str())
            .collect();

        assert_eq!(
            group_ids,
            vec![UNGROUPED_SAVED_ROOM_GROUP_ID, "event", "chat", "game"]
        );
    }

    #[test]
    fn normalize_app_config_rebuilds_empty_groups_and_marks_invalid_room_ungrouped() {
        let mut config: AppConfig = serde_json::from_value(json!({
            "savedRoomGroups": [],
            "savedRooms": [
                {
                    "id": "room-1",
                    "roomId": "22625025",
                    "displayName": "无效分组房间",
                    "groupId": "missing-group",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                }
            ]
        }))
        .expect("config with invalid group should deserialize");

        let _ = normalize_app_config(&mut config);

        assert_eq!(config.saved_room_groups.len(), 4);
        assert_eq!(
            config.saved_rooms[0].group_id,
            UNGROUPED_SAVED_ROOM_GROUP_ID
        );
    }

    #[test]
    fn old_default_uncategorized_group_is_removed() {
        let mut config: AppConfig = serde_json::from_value(json!({
            "savedRoomGroups": [
                {
                    "id": "uncategorized",
                    "name": "未分类",
                    "createdAt": "2026-06-06T00:00:00.000Z",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                },
                {
                    "id": "game",
                    "name": "游戏",
                    "createdAt": "2026-06-06T00:00:00.000Z",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                }
            ],
            "savedRooms": [
                {
                    "id": "room-1",
                    "roomId": "22625025",
                    "displayName": "旧未分类房间",
                    "groupId": "uncategorized",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                }
            ]
        }))
        .expect("old default group config should deserialize");

        let _ = normalize_app_config(&mut config);

        assert_eq!(config.saved_room_groups.len(), 1);
        assert_eq!(config.saved_room_groups[0].id, "game");
        assert_eq!(
            config.saved_rooms[0].group_id,
            UNGROUPED_SAVED_ROOM_GROUP_ID
        );
    }

    #[test]
    fn deprecated_saved_room_live_status_fields_are_ignored() {
        let mut config: AppConfig = serde_json::from_value(json!({
            "savedRooms": [
                {
                    "id": "room-1",
                    "roomId": "22625025",
                    "displayName": "旧状态字段房间",
                    "liveStatus": "live",
                    "lastCheckedAt": "2026-06-06T00:00:00.000Z",
                    "updatedAt": "2026-06-06T00:00:00.000Z"
                }
            ]
        }))
        .expect("deprecated saved room status fields should be ignored");

        let _ = normalize_app_config(&mut config);

        let saved_room =
            serde_json::to_value(&config.saved_rooms[0]).expect("saved room should serialize");

        assert_eq!(
            config.saved_rooms[0].group_id,
            UNGROUPED_SAVED_ROOM_GROUP_ID
        );
        assert!(saved_room.get("liveStatus").is_none());
        assert!(saved_room.get("lastCheckedAt").is_none());
    }
}

fn legacy_shortcut_label() -> &'static str {
    if cfg!(target_os = "macos") {
        "Command+Option+D"
    } else {
        "Control+Alt+D"
    }
}
