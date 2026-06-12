use std::{collections::HashSet, fs};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const APP_CONFIG_FILE: &str = "app-config.json";
const UNGROUPED_SAVED_ROOM_GROUP_ID: &str = "uncategorized";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    pub room_id: String,
    pub saved_room_groups: Vec<SavedRoomGroup>,
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
pub struct AppearanceConfig {
    pub font_size: u32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
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
            opacity: 0.94,
            scroll_duration: 12.0,
            density: "high".to_string(),
            show_username: false,
            color: "white".to_string(),
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
pub fn save_app_config(app: AppHandle, mut config: AppConfig) -> Result<AppConfig, String> {
    normalize_app_config(&mut config);
    write_app_config(&app, &config)?;
    app.emit("app-config-changed", &config)
        .map_err(|error| error.to_string())?;
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

pub fn read_app_config(app: &AppHandle) -> Result<AppConfig, String> {
    let path = app_config_path(app)?;
    if !path.exists() {
        let mut config = AppConfig::default();
        normalize_app_config(&mut config);
        return Ok(config);
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
    if config.shortcuts.open_send_danmaku.is_empty() {
        config.shortcuts.open_send_danmaku = send_danmaku_shortcut_label().to_string();
    }
    normalize_app_config(&mut config);
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

fn normalize_app_config(config: &mut AppConfig) {
    if config.appearance.font_family.trim().is_empty() {
        config.appearance.font_family = default_font_family();
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
    fn normalize_app_config_resets_empty_font_family_to_system() {
        let mut config = AppConfig::default();
        config.appearance.font_family = "   ".to_string();

        normalize_app_config(&mut config);

        assert_eq!(config.appearance.font_family, "system");
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

        normalize_app_config(&mut config);

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

        normalize_app_config(&mut config);

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

        normalize_app_config(&mut config);

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
