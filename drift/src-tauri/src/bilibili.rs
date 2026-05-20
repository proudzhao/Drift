use std::collections::HashMap;
use std::io::Read;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use flate2::read::ZlibDecoder;
use futures_util::{SinkExt, StreamExt};
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::header::{ACCEPT, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, info, warn};

const DANMU_INFO_URL: &str = "https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo";
const ROOM_INIT_URL: &str = "https://api.live.bilibili.com/room/v1/Room/room_init";
const ROOM_BASE_INFO_URL: &str =
    "https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomBaseInfo";
const ROOM_INFO_URL: &str = "https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom";
const NAV_URL: &str = "https://api.bilibili.com/x/web-interface/nav";
const BUVID_URL: &str = "https://api.bilibili.com/x/frontend/finger/spi";
const SPACE_INFO_URL: &str = "https://api.bilibili.com/x/space/acc/info";
const HEADER_SIZE: usize = 16;
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WBI_ENCODE_SET: &AsciiSet = &CONTROLS
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
const WBI_MIXIN_KEY_ENC_TAB: [usize; 64] = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
    28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
    54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];
const RECONNECT_DELAYS: [Duration; 5] = [
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(10),
    Duration::from_secs(20),
];
static ANCHOR_NAME_CACHE: LazyLock<Mutex<HashMap<u64, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Default)]
pub struct DanmakuTaskState {
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
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

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    code: i32,
    message: String,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct NavData {
    #[serde(rename = "wbi_img")]
    wbi_img: WbiImg,
}

#[derive(Debug, Deserialize)]
struct WbiImg {
    #[serde(rename = "img_url")]
    img_url: String,
    #[serde(rename = "sub_url")]
    sub_url: String,
}

#[derive(Debug, Deserialize)]
struct BuvidData {
    #[serde(rename = "b_3")]
    b_3: String,
    #[serde(rename = "b_4")]
    b_4: String,
}

#[derive(Debug, Deserialize)]
struct DanmuInfo {
    token: String,
    #[serde(rename = "host_list")]
    host_list: Vec<DanmuHost>,
}

#[derive(Debug, Deserialize)]
struct DanmuHost {
    host: String,
    #[serde(rename = "wss_port")]
    wss_port: u16,
}

#[derive(Debug, Deserialize)]
struct RoomInitData {
    room_id: u64,
    uid: u64,
    live_status: u8,
}

#[derive(Debug, Deserialize)]
struct SpaceInfo {
    name: String,
}

#[derive(Debug, Deserialize)]
struct RoomBaseInfoData {
    #[serde(rename = "by_room_ids")]
    by_room_ids: HashMap<String, RoomBaseInfo>,
}

#[derive(Debug, Deserialize)]
struct RoomBaseInfo {
    uid: u64,
    uname: String,
}

#[derive(Debug, Deserialize)]
struct RoomInfoByRoom {
    #[serde(rename = "anchor_info")]
    anchor_info: AnchorInfo,
}

#[derive(Debug, Deserialize)]
struct AnchorInfo {
    #[serde(rename = "base_info")]
    base_info: AnchorBaseInfo,
}

#[derive(Debug, Deserialize)]
struct AnchorBaseInfo {
    uname: String,
}

enum ConnectionResult {
    NotLive,
}

#[tauri::command]
pub fn start_bilibili_danmaku(
    app: AppHandle,
    state: tauri::State<'_, DanmakuTaskState>,
    room_id: u64,
) -> Result<(), String> {
    stop_existing_task(&state);

    let task = tauri::async_runtime::spawn(async move {
        run_with_reconnect(app, room_id).await;
    });

    *state.task.lock().map_err(|error| error.to_string())? = Some(task);
    Ok(())
}

#[tauri::command]
pub fn stop_bilibili_danmaku(
    app: AppHandle,
    state: tauri::State<'_, DanmakuTaskState>,
) -> Result<(), String> {
    stop_existing_task(&state);
    emit_status(&app, "disconnected", "已手动断开");
    Ok(())
}

fn stop_existing_task(state: &tauri::State<'_, DanmakuTaskState>) {
    if let Ok(mut task) = state.task.lock() {
        if let Some(task) = task.take() {
            task.abort();
        }
    }
}

async fn run_with_reconnect(app: AppHandle, room_id: u64) {
    info!(target: "drift::bilibili", room_id, "starting danmaku connection task");
    emit_status(&app, "connecting", format!("正在连接直播间 {}", room_id));

    let mut attempt = 0usize;
    loop {
        match connect_room(app.clone(), room_id).await {
            Ok(ConnectionResult::NotLive) => {
                info!(target: "drift::bilibili", room_id, "room is not live; connection task ended");
                break;
            }
            Err(error) => {
                let user_error = classify_connection_error(&error);
                if user_error.is_terminal {
                    emit_status(&app, user_error.status, user_error.message);
                    break;
                }

                let delay = RECONNECT_DELAYS[attempt.min(RECONNECT_DELAYS.len() - 1)];
                warn!(
                    target: "drift::bilibili",
                    room_id,
                    attempt,
                    delay_seconds = delay.as_secs(),
                    error = %error,
                    "danmaku connection failed; scheduling reconnect"
                );
                emit_status(
                    &app,
                    user_error.status,
                    format!("{}，{} 秒后重试", user_error.message, delay.as_secs()),
                );
                tokio::time::sleep(delay).await;
                attempt += 1;
            }
        }
    }
}

struct UserConnectionError {
    status: &'static str,
    message: String,
    is_terminal: bool,
}

fn classify_connection_error(error: &str) -> UserConnectionError {
    if error.contains("房间号不存在") || error.contains("room_init 返回错误") {
        return UserConnectionError {
            status: "invalid_room",
            message: "房间号不存在或当前不可访问，请检查输入的直播间号".to_string(),
            is_terminal: true,
        };
    }

    if error.contains("-799") || error.contains("请求过于频繁") {
        return UserConnectionError {
            status: "reconnecting",
            message: "B 站接口请求过于频繁".to_string(),
            is_terminal: false,
        };
    }

    if error.contains("-352") {
        return UserConnectionError {
            status: "reconnecting",
            message: "B 站接口风控或签名校验失败".to_string(),
            is_terminal: false,
        };
    }

    if error.contains("HTTP") {
        return UserConnectionError {
            status: "reconnecting",
            message: "B 站接口 HTTP 响应异常，请稍后重试".to_string(),
            is_terminal: false,
        };
    }

    if error.contains("WebSocket") || error.contains("服务器关闭连接") {
        return UserConnectionError {
            status: "reconnecting",
            message: "弹幕服务器连接异常".to_string(),
            is_terminal: false,
        };
    }

    if error.contains("请求失败") || error.contains("响应读取失败") {
        return UserConnectionError {
            status: "reconnecting",
            message: "网络请求失败，请检查网络后等待重试".to_string(),
            is_terminal: false,
        };
    }

    UserConnectionError {
        status: "reconnecting",
        message: "弹幕连接失败".to_string(),
        is_terminal: false,
    }
}

async fn connect_room(app: AppHandle, room_id: u64) -> Result<ConnectionResult, String> {
    let room_init = fetch_room_init(room_id).await?;
    let room_id = room_init.room_id;
    info!(
        target: "drift::bilibili.http",
        room_id,
        anchor_uid = room_init.uid,
        live_status = room_init.live_status,
        "resolved room init info"
    );
    let device = fetch_buvid().await?;

    let anchor_name = resolve_anchor_name(room_id, room_init.uid, &device.cookie).await;

    if room_init.live_status != 1 {
        emit_room_status(
            &app,
            "not_live",
            "直播间未开播",
            room_id,
            anchor_name.clone(),
            Some(room_init.live_status),
        );
        return Ok(ConnectionResult::NotLive);
    }

    let danmu_info = fetch_danmu_info(room_id, &device.cookie).await?;
    let host = danmu_info
        .host_list
        .first()
        .ok_or_else(|| "B 站没有返回弹幕服务器地址".to_string())?;
    let url = format!("wss://{}:{}/sub", host.host, host.wss_port);

    info!(target: "drift::bilibili.ws", room_id, url = %url, "connecting websocket");
    emit_room_status(
        &app,
        "connecting",
        format!("正在连接 {}", host.host),
        room_id,
        anchor_name.clone(),
        Some(room_init.live_status),
    );
    let (socket, _) = connect_async(&url)
        .await
        .map_err(|error| format!("WebSocket 连接失败：{}", error))?;
    let (mut writer, mut reader) = socket.split();

    let auth_body = json!({
        "uid": 0,
        "roomid": room_id,
        "protover": 2,
        "buvid": device.buvid3,
        "platform": "web",
        "type": 2,
        "key": danmu_info.token,
    });
    writer
        .send(Message::Binary(
            build_packet(7, 1, auth_body.to_string().as_bytes()).into(),
        ))
        .await
        .map_err(|error| format!("认证包发送失败：{}", error))?;

    info!(target: "drift::bilibili.ws", room_id, "auth packet sent");
    emit_room_status(
        &app,
        "connected",
        format!("已连接直播间 {}", room_id),
        room_id,
        anchor_name,
        Some(room_init.live_status),
    );
    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);

    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                debug!(target: "drift::bilibili.ws", room_id, "sending heartbeat");
                writer
                    .send(Message::Binary(build_packet(2, 1, b"[Object object]").into()))
                    .await
                    .map_err(|error| format!("心跳发送失败：{}", error))?;
            }
            message = reader.next() => {
                match message {
                    Some(Ok(Message::Binary(bytes))) => handle_packet(&app, &bytes)?,
                    Some(Ok(Message::Close(_))) => return Err("服务器关闭连接".to_string()),
                    Some(Ok(_)) => {}
                    Some(Err(error)) => return Err(format!("WebSocket 读取失败：{}", error)),
                    None => return Err("WebSocket 连接结束".to_string()),
                }
            }
        }
    }
}

async fn fetch_room_info(room_id: u64, cookie: &str) -> Result<RoomInfoByRoom, String> {
    debug!(target: "drift::bilibili.http", room_id, "requesting room info");
    let response = reqwest::Client::new()
        .get(ROOM_INFO_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://live.bilibili.com/")
        .header("Cookie", cookie)
        .query(&[("room_id", room_id)])
        .send()
        .await
        .map_err(|error| format!("直播间信息请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("直播间信息响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "直播间信息 HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response =
        serde_json::from_slice::<ApiResponse<RoomInfoByRoom>>(&bytes).map_err(|error| {
            format!(
                "直播间信息 JSON 解析失败：{}；响应片段：{}",
                error,
                response_preview(&bytes)
            )
        })?;

    if response.code != 0 {
        return Err(format!(
            "房间号不存在或不可访问：{} {}",
            response.code, response.message
        ));
    }

    response
        .data
        .ok_or_else(|| "直播间信息响应缺少 data 字段".to_string())
}

async fn resolve_anchor_name(room_id: u64, uid: u64, cookie: &str) -> Option<String> {
    if let Some(anchor_name) = cached_anchor_name(uid) {
        debug!(
            target: "drift::bilibili.http",
            room_id,
            anchor_uid = uid,
            "using cached anchor name"
        );
        return Some(anchor_name);
    }

    match fetch_room_base_anchor_name(room_id, uid, cookie).await {
        Ok(anchor_name) => {
            cache_anchor_name(uid, &anchor_name);
            return Some(anchor_name);
        }
        Err(error) => warn!(
            target: "drift::bilibili.http",
            room_id,
            anchor_uid = uid,
            error = %error,
            "room base info request failed; trying anchor profile fallback"
        ),
    }

    match fetch_anchor_name(uid, cookie).await {
        Ok(anchor_name) => {
            cache_anchor_name(uid, &anchor_name);
            return Some(anchor_name);
        }
        Err(error) => warn!(
            target: "drift::bilibili.http",
            room_id,
            anchor_uid = uid,
            error = %error,
            "anchor profile request failed; trying room info fallback"
        ),
    }

    match fetch_room_info(room_id, cookie).await {
        Ok(room_info) => {
            let anchor_name = room_info.anchor_info.base_info.uname;
            cache_anchor_name(uid, &anchor_name);
            Some(anchor_name)
        }
        Err(error) => {
            warn!(
                target: "drift::bilibili.http",
                room_id,
                error = %error,
                "room info fallback failed; continuing without anchor metadata"
            );
            None
        }
    }
}

async fn fetch_room_base_anchor_name(
    room_id: u64,
    uid: u64,
    cookie: &str,
) -> Result<String, String> {
    debug!(target: "drift::bilibili.http", room_id, "requesting room base info");
    let response = reqwest::Client::new()
        .get(ROOM_BASE_INFO_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://live.bilibili.com/")
        .header("Cookie", cookie)
        .query(&[
            ("room_ids", room_id.to_string()),
            ("req_biz", "web_room_componet".to_string()),
        ])
        .send()
        .await
        .map_err(|error| format!("直播间基础信息请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("直播间基础信息响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "直播间基础信息 HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response =
        serde_json::from_slice::<ApiResponse<RoomBaseInfoData>>(&bytes).map_err(|error| {
            format!(
                "直播间基础信息 JSON 解析失败：{}；响应片段：{}",
                error,
                response_preview(&bytes)
            )
        })?;

    if response.code != 0 {
        return Err(format!(
            "直播间基础信息返回错误：{} {}",
            response.code, response.message
        ));
    }

    let data = response
        .data
        .ok_or_else(|| "直播间基础信息响应缺少 data 字段".to_string())?;
    let room = data
        .by_room_ids
        .get(&room_id.to_string())
        .or_else(|| data.by_room_ids.values().find(|room| room.uid == uid))
        .ok_or_else(|| "直播间基础信息缺少当前房间".to_string())?;

    if room.uname.trim().is_empty() {
        return Err("直播间基础信息缺少 uname 字段".to_string());
    }

    Ok(room.uname.clone())
}

async fn fetch_danmu_info(room_id: u64, cookie: &str) -> Result<DanmuInfo, String> {
    let wbi_params = build_wbi_params(room_id, cookie).await?;
    debug!(target: "drift::bilibili.http", room_id, "requesting getDanmuInfo");
    let response = reqwest::Client::new()
        .get(DANMU_INFO_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://live.bilibili.com/")
        .header("Cookie", cookie)
        .query(&wbi_params)
        .send()
        .await
        .map_err(|error| format!("getDanmuInfo 请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("getDanmuInfo 响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "getDanmuInfo HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response = serde_json::from_slice::<ApiResponse<DanmuInfo>>(&bytes).map_err(|error| {
        format!(
            "getDanmuInfo JSON 解析失败：{}；响应片段：{}",
            error,
            response_preview(&bytes)
        )
    })?;

    if response.code != 0 {
        warn!(
            target: "drift::bilibili.http",
            room_id,
            code = response.code,
            message = %response.message,
            "getDanmuInfo returned non-zero code"
        );
        return Err(format!(
            "getDanmuInfo 返回错误：{} {}",
            response.code, response.message
        ));
    }

    response
        .data
        .ok_or_else(|| "getDanmuInfo 响应缺少 data 字段".to_string())
}

async fn build_wbi_params(room_id: u64, cookie: &str) -> Result<Vec<(String, String)>, String> {
    let wts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{}", error))?
        .as_secs()
        .to_string();
    let mixin_key = fetch_wbi_mixin_key(cookie).await?;
    let mut params = vec![
        ("id".to_string(), room_id.to_string()),
        ("type".to_string(), "0".to_string()),
        ("web_location".to_string(), "444.8".to_string()),
        ("wts".to_string(), wts),
    ];
    params.sort_by(|left, right| left.0.cmp(&right.0));

    let query = params
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                encode_wbi_component(key),
                encode_wbi_component(&filter_wbi_value(value))
            )
        })
        .collect::<Vec<_>>()
        .join("&");
    let w_rid = format!("{:x}", md5::compute(format!("{}{}", query, mixin_key)));
    params.push(("w_rid".to_string(), w_rid));
    Ok(params)
}

async fn fetch_wbi_mixin_key(cookie: &str) -> Result<String, String> {
    debug!(target: "drift::bilibili.http", "requesting WBI nav keys");
    let response = reqwest::Client::new()
        .get(NAV_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com/")
        .header("Cookie", cookie)
        .send()
        .await
        .map_err(|error| format!("WBI nav 请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("WBI nav 响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "WBI nav HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response = serde_json::from_slice::<ApiResponse<NavData>>(&bytes).map_err(|error| {
        format!(
            "WBI nav JSON 解析失败：{}；响应片段：{}",
            error,
            response_preview(&bytes)
        )
    })?;

    let data = response
        .data
        .ok_or_else(|| format!("WBI nav 返回错误：{} {}", response.code, response.message))?;
    let raw_key = format!(
        "{}{}",
        extract_url_file_stem(&data.wbi_img.img_url)?,
        extract_url_file_stem(&data.wbi_img.sub_url)?
    );
    Ok(mixin_key(&raw_key))
}

async fn fetch_room_init(room_id: u64) -> Result<RoomInitData, String> {
    debug!(target: "drift::bilibili.http", room_id, "requesting room_init");
    let response = reqwest::Client::new()
        .get(ROOM_INIT_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://live.bilibili.com/")
        .query(&[("id", room_id)])
        .send()
        .await
        .map_err(|error| format!("room_init 请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("room_init 响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "room_init HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response =
        serde_json::from_slice::<ApiResponse<RoomInitData>>(&bytes).map_err(|error| {
            format!(
                "room_init JSON 解析失败：{}；响应片段：{}",
                error,
                response_preview(&bytes)
            )
        })?;

    if response.code != 0 {
        return Err(format!(
            "房间号不存在或不可访问：{} {}",
            response.code, response.message
        ));
    }

    response
        .data
        .ok_or_else(|| "room_init 响应缺少 data 字段".to_string())
}

async fn fetch_anchor_name(uid: u64, cookie: &str) -> Result<String, String> {
    debug!(target: "drift::bilibili.http", anchor_uid = uid, "requesting anchor profile");
    let response = reqwest::Client::new()
        .get(SPACE_INFO_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://space.bilibili.com/")
        .header("Cookie", cookie)
        .query(&[("mid", uid)])
        .send()
        .await
        .map_err(|error| format!("主播信息请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("主播信息响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "主播信息 HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response = serde_json::from_slice::<ApiResponse<SpaceInfo>>(&bytes).map_err(|error| {
        format!(
            "主播信息 JSON 解析失败：{}；响应片段：{}",
            error,
            response_preview(&bytes)
        )
    })?;

    if response.code != 0 {
        return Err(format!(
            "主播信息返回错误：{} {}",
            response.code, response.message
        ));
    }

    let data = response
        .data
        .ok_or_else(|| "主播信息响应缺少 data 字段".to_string())?;
    if data.name.trim().is_empty() {
        return Err("主播信息响应缺少 name 字段".to_string());
    }

    Ok(data.name)
}

struct DeviceCookie {
    buvid3: String,
    cookie: String,
}

async fn fetch_buvid() -> Result<DeviceCookie, String> {
    debug!(target: "drift::bilibili.http", "requesting anonymous buvid");
    let response = reqwest::Client::new()
        .get(BUVID_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com/")
        .send()
        .await
        .map_err(|error| format!("buvid 请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("buvid 响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "buvid HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response = serde_json::from_slice::<ApiResponse<BuvidData>>(&bytes).map_err(|error| {
        format!(
            "buvid JSON 解析失败：{}；响应片段：{}",
            error,
            response_preview(&bytes)
        )
    })?;

    if response.code != 0 {
        return Err(format!(
            "buvid 返回错误：{} {}",
            response.code, response.message
        ));
    }

    let data = response
        .data
        .ok_or_else(|| "buvid 响应缺少 data 字段".to_string())?;
    let cookie = format!("buvid3={}; buvid4={};", data.b_3, data.b_4);
    Ok(DeviceCookie {
        buvid3: data.b_3,
        cookie,
    })
}

fn extract_url_file_stem(url: &str) -> Result<String, String> {
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

fn mixin_key(raw_key: &str) -> String {
    WBI_MIXIN_KEY_ENC_TAB
        .iter()
        .filter_map(|index| raw_key.chars().nth(*index))
        .take(32)
        .collect()
}

fn filter_wbi_value(value: &str) -> String {
    value
        .chars()
        .filter(|character| !matches!(character, '!' | '\'' | '(' | ')' | '*'))
        .collect()
}

fn encode_wbi_component(value: &str) -> String {
    utf8_percent_encode(value, WBI_ENCODE_SET).to_string()
}

fn response_preview(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    text.chars().take(160).collect()
}

fn cached_anchor_name(uid: u64) -> Option<String> {
    ANCHOR_NAME_CACHE
        .lock()
        .ok()
        .and_then(|cache| cache.get(&uid).cloned())
}

fn cache_anchor_name(uid: u64, anchor_name: &str) {
    if let Ok(mut cache) = ANCHOR_NAME_CACHE.lock() {
        cache.insert(uid, anchor_name.to_string());
    }
}

fn build_packet(operation: u32, protocol: u16, payload: &[u8]) -> Vec<u8> {
    let packet_len = (HEADER_SIZE + payload.len()) as u32;
    let mut packet = Vec::with_capacity(packet_len as usize);
    packet.extend_from_slice(&packet_len.to_be_bytes());
    packet.extend_from_slice(&(HEADER_SIZE as u16).to_be_bytes());
    packet.extend_from_slice(&protocol.to_be_bytes());
    packet.extend_from_slice(&operation.to_be_bytes());
    packet.extend_from_slice(&1u32.to_be_bytes());
    packet.extend_from_slice(payload);
    packet
}

fn handle_packet(app: &AppHandle, bytes: &[u8]) -> Result<(), String> {
    let packets = unpack_packets(bytes)?;

    for packet in packets {
        match packet.operation {
            3 => {
                if packet.payload.len() >= 4 {
                    let popularity = u32::from_be_bytes(packet.payload[..4].try_into().unwrap());
                    debug!(target: "drift::bilibili.ws", popularity, "received popularity update");
                }
            }
            5 => handle_command_payload(app, &packet.payload),
            8 => emit_status(app, "connected", "认证成功"),
            _ => warn!(
                target: "drift::bilibili.proto",
                operation = packet.operation,
                "unknown bilibili packet operation"
            ),
        }
    }

    Ok(())
}

fn handle_command_payload(app: &AppHandle, payload: &[u8]) {
    let Ok(value) = serde_json::from_slice::<Value>(payload) else {
        warn!(target: "drift::bilibili.proto", "command payload JSON parse failed");
        return;
    };

    let command = value.get("cmd").and_then(Value::as_str);
    if command != Some("DANMU_MSG") {
        if let Some(command) = command {
            debug!(target: "drift::bilibili.proto", command, "ignored bilibili command");
        }
        return;
    }

    let Some(info) = value.get("info").and_then(Value::as_array) else {
        return;
    };
    let Some(text) = info.get(1).and_then(Value::as_str) else {
        return;
    };
    let Some(user_info) = info.get(2).and_then(Value::as_array) else {
        return;
    };

    let uid = user_info.first().and_then(Value::as_u64).unwrap_or(0);
    let user = user_info
        .get(1)
        .and_then(Value::as_str)
        .unwrap_or("匿名用户")
        .to_string();
    let timestamp = info
        .first()
        .and_then(Value::as_array)
        .and_then(|meta| meta.get(4))
        .and_then(Value::as_u64)
        .unwrap_or(0);

    let message = DanmakuMessage {
        id: format!("{}-{}-{}", uid, timestamp, text.len()),
        user,
        text: text.to_string(),
    };

    if let Err(error) = app.emit("danmaku-message", message) {
        error!(target: "drift::danmaku", error = %error, "danmaku-message emit failed");
    }
}

struct Packet {
    operation: u32,
    payload: Vec<u8>,
}

fn unpack_packets(bytes: &[u8]) -> Result<Vec<Packet>, String> {
    let mut packets = Vec::new();
    let mut offset = 0usize;

    while offset + HEADER_SIZE <= bytes.len() {
        let packet_len = read_u32(bytes, offset)? as usize;
        let header_len = read_u16(bytes, offset + 4)? as usize;
        let protocol = read_u16(bytes, offset + 6)?;
        let operation = read_u32(bytes, offset + 8)?;

        if packet_len < header_len || offset + packet_len > bytes.len() {
            return Err(format!("非法数据包长度：{}", packet_len));
        }

        let payload = &bytes[offset + header_len..offset + packet_len];
        match protocol {
            0 | 1 => packets.push(Packet {
                operation,
                payload: payload.to_vec(),
            }),
            2 => packets.extend(unpack_packets(&decompress_zlib(payload)?)?),
            3 => packets.extend(unpack_packets(&decompress_brotli(payload)?)?),
            _ => warn!(
                target: "drift::bilibili.proto",
                protocol,
                operation,
                "unknown bilibili packet protocol"
            ),
        }

        offset += packet_len;
    }

    Ok(packets)
}

fn decompress_zlib(payload: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = ZlibDecoder::new(payload);
    let mut output = Vec::new();
    decoder
        .read_to_end(&mut output)
        .map_err(|error| format!("zlib 解压失败：{}", error))?;
    Ok(output)
}

fn decompress_brotli(payload: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = brotli::Decompressor::new(payload, 4096);
    let mut output = Vec::new();
    decoder
        .read_to_end(&mut output)
        .map_err(|error| format!("brotli 解压失败：{}", error))?;
    Ok(output)
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "数据包 u16 越界".to_string())?;
    Ok(u16::from_be_bytes(slice.try_into().unwrap()))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "数据包 u32 越界".to_string())?;
    Ok(u32::from_be_bytes(slice.try_into().unwrap()))
}

fn emit_status(app: &AppHandle, status: &str, message: impl Into<String>) {
    let event = DanmakuStatus {
        status: status.to_string(),
        message: message.into(),
        room_id: None,
        anchor_name: None,
        live_status: None,
    };

    emit_status_event(app, event);
}

fn emit_room_status(
    app: &AppHandle,
    status: &str,
    message: impl Into<String>,
    room_id: u64,
    anchor_name: Option<String>,
    live_status: Option<u8>,
) {
    let event = DanmakuStatus {
        status: status.to_string(),
        message: message.into(),
        room_id: Some(room_id),
        anchor_name,
        live_status,
    };

    emit_status_event(app, event);
}

fn emit_status_event(app: &AppHandle, event: DanmakuStatus) {
    if let Err(error) = app.emit("danmaku-status", event) {
        error!(target: "drift::danmaku", error = %error, "danmaku-status emit failed");
    }
}
