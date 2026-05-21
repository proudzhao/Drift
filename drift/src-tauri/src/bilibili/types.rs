use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use serde::{Deserialize, Serialize};

// ── URLs & constants ──

pub(crate) const DANMU_INFO_URL: &str =
    "https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo";
pub(crate) const ROOM_INIT_URL: &str =
    "https://api.live.bilibili.com/room/v1/Room/room_init";
pub(crate) const ROOM_BASE_INFO_URL: &str =
    "https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomBaseInfo";
pub(crate) const ROOM_INFO_URL: &str =
    "https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom";
pub(crate) const NAV_URL: &str = "https://api.bilibili.com/x/web-interface/nav";
pub(crate) const BUVID_URL: &str = "https://api.bilibili.com/x/frontend/finger/spi";
pub(crate) const SPACE_INFO_URL: &str = "https://api.bilibili.com/x/space/acc/info";
pub(crate) const HEADER_SIZE: usize = 16;
pub(crate) const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
pub(crate) const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
pub(crate) const WBI_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'$')
    .add(b'%')
    .add(b'&')
    .add(b'+')
    .add(b',')
    .add(b'/')
    .add(b':')
    .add(b';')
    .add(b'<')
    .add(b'=')
    .add(b'>')
    .add(b'?')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');
pub(crate) const WBI_MIXIN_KEY_ENC_TAB: [usize; 64] = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
    28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
    54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];
pub(crate) const RECONNECT_DELAYS: [Duration; 5] = [
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(10),
    Duration::from_secs(20),
];
pub(crate) const DANMAKU_FLUSH_INTERVAL: Duration = Duration::from_millis(150);
pub(crate) const DANMAKU_BUFFER_MAX: usize = 100;
pub(crate) static ANCHOR_NAME_CACHE: LazyLock<Mutex<HashMap<u64, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// ── Public API types ──

#[derive(Default)]
pub struct DanmakuTaskState {
    pub(crate) task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DanmakuMessage {
    pub id: String,
    pub user: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DanmakuStatus {
    pub status: String,
    pub message: String,
    pub room_id: Option<u64>,
    pub anchor_name: Option<String>,
    pub live_status: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiTestStep {
    pub key: String,
    pub label: String,
    pub status: String,
    pub duration_ms: u64,
    pub message: String,
    pub detail: String,
}

// ── Internal types ──

#[derive(Debug, Deserialize)]
pub(crate) struct ApiResponse<T> {
    pub(crate) code: i32,
    pub(crate) message: String,
    pub(crate) data: Option<T>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct NavData {
    #[serde(rename = "wbi_img")]
    pub(crate) wbi_img: WbiImg,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WbiImg {
    #[serde(rename = "img_url")]
    pub(crate) img_url: String,
    #[serde(rename = "sub_url")]
    pub(crate) sub_url: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BuvidData {
    #[serde(rename = "b_3")]
    pub(crate) b_3: String,
    #[serde(rename = "b_4")]
    pub(crate) b_4: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DanmuInfo {
    pub(crate) token: String,
    #[serde(rename = "host_list")]
    pub(crate) host_list: Vec<DanmuHost>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DanmuHost {
    pub(crate) host: String,
    #[serde(rename = "wss_port")]
    pub(crate) wss_port: u16,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RoomInitData {
    pub(crate) room_id: u64,
    pub(crate) uid: u64,
    pub(crate) live_status: u8,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SpaceInfo {
    pub(crate) name: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RoomBaseInfoData {
    #[serde(rename = "by_room_ids")]
    pub(crate) by_room_ids: HashMap<String, RoomBaseInfo>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RoomBaseInfo {
    pub(crate) uid: u64,
    pub(crate) uname: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RoomInfoByRoom {
    #[serde(rename = "anchor_info")]
    pub(crate) anchor_info: AnchorInfo,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnchorInfo {
    #[serde(rename = "base_info")]
    pub(crate) base_info: AnchorBaseInfo,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnchorBaseInfo {
    pub(crate) uname: String,
}

pub(crate) enum ConnectionResult {
    NotLive,
}

pub(crate) struct DeviceCookie {
    pub(crate) buvid3: String,
    pub(crate) cookie: String,
}

pub(crate) struct UserConnectionError {
    pub(crate) status: &'static str,
    pub(crate) message: String,
    pub(crate) is_terminal: bool,
}

pub(crate) struct Packet {
    pub(crate) operation: u32,
    pub(crate) payload: Vec<u8>,
}

// ── WBI helpers ──

pub(crate) fn extract_url_file_stem(url: &str) -> Result<String, String> {
    let filename = url
        .rsplit('/')
        .next()
        .ok_or_else(|| format!("WBI 图片 URL 无效：{}", url))?;
    let stem = filename
        .split('.')
        .next()
        .ok_or_else(|| format!("WBI 图片文件名无效：{}", filename))?;
    Ok(stem.to_string())
}

pub(crate) fn mixin_key(raw_key: &str) -> String {
    WBI_MIXIN_KEY_ENC_TAB
        .iter()
        .filter_map(|index| raw_key.chars().nth(*index))
        .take(32)
        .collect()
}

pub(crate) fn filter_wbi_value(value: &str) -> String {
    value
        .chars()
        .filter(|character| !matches!(character, '!' | '\'' | '(' | ')' | '*'))
        .collect()
}

pub(crate) fn encode_wbi_component(value: &str) -> String {
    utf8_percent_encode(value, WBI_ENCODE_SET).to_string()
}

pub(crate) fn response_preview(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    text.chars().take(160).collect()
}

pub(crate) fn cached_anchor_name(uid: u64) -> Option<String> {
    ANCHOR_NAME_CACHE
        .lock()
        .ok()
        .and_then(|cache| cache.get(&uid).cloned())
}

pub(crate) fn cache_anchor_name(uid: u64, anchor_name: &str) {
    if let Ok(mut cache) = ANCHOR_NAME_CACHE.lock() {
        cache.insert(uid, anchor_name.to_string());
    }
}

pub(crate) fn param_value(params: &[(String, String)], key: &str) -> Option<String> {
    params
        .iter()
        .find_map(|(param_key, value)| (param_key == key).then(|| value.clone()))
}

pub(crate) fn compact_token(value: &str) -> String {
    let char_count = value.chars().count();
    if char_count <= 12 {
        return value.to_string();
    }
    let prefix: String = value.chars().take(6).collect();
    let suffix: String = value
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{}...{}", prefix, suffix)
}

pub(crate) fn elapsed_ms(started_at: std::time::Instant) -> u64 {
    started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
}
