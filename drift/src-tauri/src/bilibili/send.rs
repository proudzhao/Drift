use super::cookies::BilibiliCookieBundle;
use super::session;
use super::types::{DanmakuStatus, BROWSER_USER_AGENT};
use reqwest::header::{ACCEPT, CONTENT_TYPE, ORIGIN, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tracing::{info, warn};

const SEND_DANMAKU_URL: &str = "https://api.live.bilibili.com/msg/send";
const SEND_COOLDOWN: Duration = Duration::from_secs(3);
const TEXT_LIMIT: usize = 60;

#[derive(Debug)]
pub struct SendDanmakuState {
    current_room: Mutex<CurrentRoomState>,
    last_attempt_at: Mutex<Option<Instant>>,
    last_result: Mutex<LastSendDiagnostic>,
}

impl Default for SendDanmakuState {
    fn default() -> Self {
        Self {
            current_room: Mutex::new(CurrentRoomState::default()),
            last_attempt_at: Mutex::new(None),
            last_result: Mutex::new(LastSendDiagnostic::default()),
        }
    }
}

impl SendDanmakuState {
    fn sync_status(&self, event: &DanmakuStatus) -> Result<(), String> {
        let mut current_room = self
            .current_room
            .lock()
            .map_err(|error| format!("发送状态读取失败：{}", error))?;

        if event.status == "connected" && event.room_id.is_none() {
            return Ok(());
        }

        current_room.status = event.status.clone();
        current_room.room_id = event.room_id;
        current_room.anchor_name = event.anchor_name.clone();
        current_room.live_status = event.live_status;

        if event.room_id.is_none() && event.status != "connected" {
            current_room.room_id = None;
            current_room.anchor_name = None;
            current_room.live_status = None;
        }

        Ok(())
    }

    fn room_snapshot(&self) -> Result<CurrentRoomState, String> {
        self.current_room
            .lock()
            .map(|room| room.clone())
            .map_err(|error| format!("发送状态读取失败：{}", error))
    }

    fn mark_attempt(&self, now: Instant) -> Result<(), String> {
        let mut last_attempt_at = self
            .last_attempt_at
            .lock()
            .map_err(|error| format!("发送冷却状态读取失败：{}", error))?;

        if let Some(last_attempt_at) = *last_attempt_at {
            if let Some(remaining) = cooldown_remaining(last_attempt_at, now) {
                return Err(format!(
                    "发送太快了，请 {:.1} 秒后再试",
                    remaining.as_secs_f32()
                ));
            }
        }

        *last_attempt_at = Some(now);
        Ok(())
    }

    fn cooldown_remaining_ms(&self, now: Instant) -> Result<u64, String> {
        let last_attempt_at = self
            .last_attempt_at
            .lock()
            .map_err(|error| format!("发送冷却状态读取失败：{}", error))?;

        Ok(last_attempt_at
            .and_then(|last_attempt_at| cooldown_remaining(last_attempt_at, now))
            .map(|remaining| remaining.as_millis() as u64)
            .unwrap_or(0))
    }

    fn remember_result(&self, code: Option<i32>, error: Option<String>) {
        if let Ok(mut last_result) = self.last_result.lock() {
            *last_result = LastSendDiagnostic { code, error };
        }
    }

    fn last_result_snapshot(&self) -> LastSendDiagnostic {
        self.last_result
            .lock()
            .map(|result| result.clone())
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CurrentRoomState {
    status: String,
    room_id: Option<u64>,
    anchor_name: Option<String>,
    live_status: Option<u8>,
}

impl Default for CurrentRoomState {
    fn default() -> Self {
        Self {
            status: "disconnected".to_string(),
            room_id: None,
            anchor_name: None,
            live_status: None,
        }
    }
}

#[derive(Debug, Clone)]
struct SendRequestContext {
    room_id: u64,
    text: String,
    cookie_header: String,
    csrf: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct LastSendDiagnostic {
    code: Option<i32>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendDanmakuResult {
    pub code: i32,
    pub message: String,
    pub cooldown_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendDanmakuStatus {
    pub can_send: bool,
    pub reason: String,
    pub room_id: Option<u64>,
    pub anchor_name: Option<String>,
    pub status: String,
    pub cooldown_ms: u64,
}

#[derive(Debug, Deserialize)]
struct SendDanmakuResponse {
    code: i32,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    msg: Option<String>,
    data: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn send_bilibili_danmaku(
    state: tauri::State<'_, SendDanmakuState>,
    text: String,
) -> Result<SendDanmakuResult, String> {
    let room = match state.room_snapshot() {
        Ok(room) => room,
        Err(error) => {
            state.remember_result(None, Some(error.clone()));
            return Err(error);
        }
    };
    let bundle = match session::load_cookie_bundle() {
        Ok(bundle) => bundle,
        Err(error) => {
            state.remember_result(None, Some(error.clone()));
            return Err(error);
        }
    };
    let context = match build_send_context(&text, room, bundle.as_ref(), now_unix()) {
        Ok(context) => context,
        Err(error) => {
            state.remember_result(None, Some(error.clone()));
            return Err(error);
        }
    };
    if let Err(error) = state.mark_attempt(Instant::now()) {
        state.remember_result(None, Some(error.clone()));
        return Err(error);
    }

    match send_danmaku_request(&context).await {
        Ok(result) => {
            state.remember_result(Some(result.code), None);
            Ok(result)
        }
        Err(error) => {
            state.remember_result(error.code, Some(error.message.clone()));
            Err(error.message)
        }
    }
}

#[tauri::command]
pub fn get_send_danmaku_status(
    state: tauri::State<'_, SendDanmakuState>,
) -> Result<SendDanmakuStatus, String> {
    let room = state.room_snapshot()?;
    let cooldown_ms = state.cooldown_remaining_ms(Instant::now())?;
    let bundle = session::load_cookie_bundle()?;
    Ok(build_send_status(
        room,
        bundle.as_ref(),
        now_unix(),
        cooldown_ms,
    ))
}

pub(crate) fn sync_room_status(app: &AppHandle, event: &DanmakuStatus) {
    let Some(state) = app.try_state::<SendDanmakuState>() else {
        return;
    };

    if let Err(error) = state.sync_status(event) {
        warn!(
            target: "drift::bilibili.send",
            error = %error,
            "failed to sync danmaku send room status"
        );
    }
}

pub(crate) fn diagnostic_lines(app: &AppHandle) -> Vec<String> {
    let (is_logged_in, has_bili_jct) = match session::load_cookie_bundle() {
        Ok(Some(bundle)) => (
            !session::is_expired(bundle.expires_at, now_unix()),
            !bundle.bili_jct.trim().is_empty(),
        ),
        Ok(None) | Err(_) => (false, false),
    };
    let last_result = app
        .try_state::<SendDanmakuState>()
        .map(|state| state.last_result_snapshot())
        .unwrap_or_default();

    vec![
        format!("send.auth.is_logged_in={}", is_logged_in),
        format!("send.auth.has_bili_jct={}", has_bili_jct),
        format!(
            "send.last_code={}",
            last_result
                .code
                .map_or("".to_string(), |code| code.to_string())
        ),
        format!("send.last_error={}", last_result.error.unwrap_or_default()),
    ]
}

fn build_send_context(
    text: &str,
    room: CurrentRoomState,
    bundle: Option<&BilibiliCookieBundle>,
    now: i64,
) -> Result<SendRequestContext, String> {
    let text = validate_text(text)?;
    let room_id = validate_room(room)?;
    let bundle = validate_bundle(bundle, now)?;

    Ok(SendRequestContext {
        room_id,
        text,
        cookie_header: bundle.cookie_header(),
        csrf: bundle.bili_jct.clone(),
    })
}

fn build_send_status(
    room: CurrentRoomState,
    bundle: Option<&BilibiliCookieBundle>,
    now: i64,
    cooldown_ms: u64,
) -> SendDanmakuStatus {
    let room_id = room.room_id;
    let anchor_name = room.anchor_name.clone();
    let status = room.status.clone();

    if let Err(reason) = validate_room(room) {
        return SendDanmakuStatus {
            can_send: false,
            reason,
            room_id,
            anchor_name,
            status,
            cooldown_ms: 0,
        };
    }

    if let Err(reason) = validate_bundle(bundle, now) {
        return SendDanmakuStatus {
            can_send: false,
            reason,
            room_id,
            anchor_name,
            status,
            cooldown_ms: 0,
        };
    }

    if cooldown_ms > 0 {
        return SendDanmakuStatus {
            can_send: false,
            reason: "已发送，稍后可继续发送".to_string(),
            room_id,
            anchor_name,
            status,
            cooldown_ms,
        };
    }

    SendDanmakuStatus {
        can_send: true,
        reason: "可以发送".to_string(),
        room_id,
        anchor_name,
        status,
        cooldown_ms: 0,
    }
}

fn validate_text(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("请输入弹幕内容".to_string());
    }

    if text.chars().count() > TEXT_LIMIT {
        return Err(format!("弹幕内容不能超过 {} 个字符", TEXT_LIMIT));
    }

    Ok(text.to_string())
}

fn validate_room(room: CurrentRoomState) -> Result<u64, String> {
    if room.status != "connected" {
        return Err(match room.status.as_str() {
            "not_live" => "当前直播间未开播，暂不能发送".to_string(),
            "connecting" | "reconnecting" => "直播间正在连接，请稍后再发送".to_string(),
            _ => "请先连接直播间".to_string(),
        });
    }

    match room.room_id {
        Some(room_id) => Ok(room_id),
        None => Err("当前连接缺少直播间信息，请重新连接".to_string()),
    }
}

fn validate_bundle<'a>(
    bundle: Option<&'a BilibiliCookieBundle>,
    now: i64,
) -> Result<&'a BilibiliCookieBundle, String> {
    let Some(bundle) = bundle else {
        return Err("请先登录 B 站".to_string());
    };

    if session::is_expired(bundle.expires_at, now) {
        return Err("登录已过期，请重新登录".to_string());
    }

    if bundle.bili_jct.trim().is_empty() {
        return Err("登录状态缺少 csrf，请重新登录".to_string());
    }

    Ok(bundle)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SendDanmakuError {
    code: Option<i32>,
    message: String,
}

impl SendDanmakuError {
    fn new(code: Option<i32>, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

async fn send_danmaku_request(
    context: &SendRequestContext,
) -> Result<SendDanmakuResult, SendDanmakuError> {
    let started_at = Instant::now();
    let response = reqwest::Client::new()
        .post(SEND_DANMAKU_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(
            REFERER,
            format!("https://live.bilibili.com/{}", context.room_id),
        )
        .header(ORIGIN, "https://live.bilibili.com")
        .header(
            CONTENT_TYPE,
            "application/x-www-form-urlencoded; charset=UTF-8",
        )
        .header("Cookie", &context.cookie_header)
        .form(&[
            ("roomid", context.room_id.to_string()),
            ("msg", context.text.clone()),
            ("rnd", now_unix().to_string()),
            ("fontsize", "25".to_string()),
            ("color", "16777215".to_string()),
            ("mode", "1".to_string()),
            ("bubble", "0".to_string()),
            ("room_type", "0".to_string()),
            ("csrf", context.csrf.clone()),
            ("csrf_token", context.csrf.clone()),
        ])
        .send()
        .await
        .map_err(|error| {
            warn!(
                target: "drift::bilibili.send",
                room_id = context.room_id,
                text_length = context.text.chars().count(),
                code = tracing::field::Empty,
                elapsed_ms = started_at.elapsed().as_millis(),
                "send danmaku request failed"
            );
            SendDanmakuError::new(None, format!("弹幕发送请求失败：{}", error))
        })?;

    let status = response.status();
    let bytes = response.bytes().await.map_err(|error| {
        warn!(
            target: "drift::bilibili.send",
            room_id = context.room_id,
            text_length = context.text.chars().count(),
            code = tracing::field::Empty,
            elapsed_ms = started_at.elapsed().as_millis(),
            "send danmaku response read failed"
        );
        SendDanmakuError::new(None, format!("弹幕发送响应读取失败：{}", error))
    })?;

    if !status.is_success() {
        warn!(
            target: "drift::bilibili.send",
            room_id = context.room_id,
            text_length = context.text.chars().count(),
            code = tracing::field::Empty,
            http_status = %status,
            elapsed_ms = started_at.elapsed().as_millis(),
            "send danmaku returned non-success http status"
        );
        return Err(SendDanmakuError::new(
            None,
            format!("弹幕发送 HTTP {}", status),
        ));
    }

    let payload = serde_json::from_slice::<SendDanmakuResponse>(&bytes).map_err(|error| {
        warn!(
            target: "drift::bilibili.send",
            room_id = context.room_id,
            text_length = context.text.chars().count(),
            code = tracing::field::Empty,
            elapsed_ms = started_at.elapsed().as_millis(),
            "send danmaku response parse failed"
        );
        SendDanmakuError::new(None, format!("弹幕发送响应解析失败：{}", error))
    })?;

    let message = response_message(&payload);
    if payload.code != 0 {
        warn!(
            target: "drift::bilibili.send",
            room_id = context.room_id,
            text_length = context.text.chars().count(),
            code = payload.code,
            elapsed_ms = started_at.elapsed().as_millis(),
            "send danmaku returned non-zero code"
        );
        return Err(SendDanmakuError::new(
            Some(payload.code),
            map_response_error(payload.code, &message),
        ));
    }

    info!(
        target: "drift::bilibili.send",
        room_id = context.room_id,
        text_length = context.text.chars().count(),
        code = payload.code,
        has_data = payload.data.is_some(),
        elapsed_ms = started_at.elapsed().as_millis(),
        "send danmaku succeeded"
    );

    Ok(SendDanmakuResult {
        code: payload.code,
        message: "已发送".to_string(),
        cooldown_ms: SEND_COOLDOWN.as_millis() as u64,
    })
}

fn response_message(payload: &SendDanmakuResponse) -> String {
    payload
        .message
        .as_deref()
        .or(payload.msg.as_deref())
        .unwrap_or_default()
        .to_string()
}

fn map_response_error(code: i32, message: &str) -> String {
    match code {
        -101 => "登录状态不可用，请重新登录 B 站后再试".to_string(),
        -111 => "登录状态失效，请重新登录 B 站后再试".to_string(),
        -400 => "发送参数异常，请稍后重试".to_string(),
        1003212 => "内容过长".to_string(),
        10031 => "发送太快了，请稍等".to_string(),
        _ if message.trim().is_empty() => format!("B 站返回错误 {}", code),
        _ => format!("B 站返回错误 {}：{}", code, message),
    }
}

fn cooldown_remaining(last_attempt_at: Instant, now: Instant) -> Option<Duration> {
    let elapsed = now.saturating_duration_since(last_attempt_at);
    if elapsed >= SEND_COOLDOWN {
        None
    } else {
        Some(SEND_COOLDOWN - elapsed)
    }
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle(expires_at: Option<i64>) -> BilibiliCookieBundle {
        BilibiliCookieBundle {
            sessdata: "sess".to_string(),
            bili_jct: "csrf".to_string(),
            dede_user_id: "123".to_string(),
            dede_user_id_ck_md5: None,
            sid: None,
            refresh_token: None,
            expires_at,
        }
    }

    fn connected_room() -> CurrentRoomState {
        CurrentRoomState {
            status: "connected".to_string(),
            room_id: Some(6),
            anchor_name: Some("测试主播".to_string()),
            live_status: Some(1),
        }
    }

    #[test]
    fn empty_text_is_rejected() {
        let error = validate_text("   ").unwrap_err();

        assert_eq!(error, "请输入弹幕内容");
    }

    #[test]
    fn overlong_text_is_rejected() {
        let error = validate_text(&"好".repeat(TEXT_LIMIT + 1)).unwrap_err();

        assert!(error.contains("不能超过"));
    }

    #[test]
    fn trims_valid_text() {
        let text = validate_text("  testtest  ").unwrap();

        assert_eq!(text, "testtest");
    }

    #[test]
    fn disconnected_room_is_rejected() {
        let error = validate_room(CurrentRoomState::default()).unwrap_err();

        assert_eq!(error, "请先连接直播间");
    }

    #[test]
    fn not_live_room_is_rejected() {
        let error = validate_room(CurrentRoomState {
            status: "not_live".to_string(),
            room_id: Some(6),
            anchor_name: Some("测试主播".to_string()),
            live_status: Some(0),
        })
        .unwrap_err();

        assert_eq!(error, "当前直播间未开播，暂不能发送");
    }

    #[test]
    fn missing_room_id_is_rejected() {
        let error = validate_room(CurrentRoomState {
            status: "connected".to_string(),
            room_id: None,
            anchor_name: Some("测试主播".to_string()),
            live_status: Some(1),
        })
        .unwrap_err();

        assert_eq!(error, "当前连接缺少直播间信息，请重新连接");
    }

    #[test]
    fn missing_login_is_rejected() {
        let error = build_send_context("test", connected_room(), None, 100).unwrap_err();

        assert_eq!(error, "请先登录 B 站");
    }

    #[test]
    fn expired_login_is_rejected() {
        let bundle = bundle(Some(99));
        let error = build_send_context("test", connected_room(), Some(&bundle), 100).unwrap_err();

        assert_eq!(error, "登录已过期，请重新登录");
    }

    #[test]
    fn build_context_uses_connected_room_and_login_bundle() {
        let bundle = bundle(Some(101));
        let context = build_send_context(" test ", connected_room(), Some(&bundle), 100).unwrap();

        assert_eq!(context.room_id, 6);
        assert_eq!(context.text, "test");
        assert_eq!(context.csrf, "csrf");
        assert!(context.cookie_header.contains("SESSDATA=sess"));
    }

    #[test]
    fn maps_known_response_errors() {
        assert_eq!(
            map_response_error(-101, ""),
            "登录状态不可用，请重新登录 B 站后再试"
        );
        assert_eq!(
            map_response_error(-111, ""),
            "登录状态失效，请重新登录 B 站后再试"
        );
        assert_eq!(map_response_error(10031, ""), "发送太快了，请稍等");
        assert_eq!(map_response_error(1003212, ""), "内容过长");
    }

    #[test]
    fn maps_unknown_response_error_with_message() {
        let error = map_response_error(123, "blocked");

        assert_eq!(error, "B 站返回错误 123：blocked");
    }

    #[test]
    fn send_status_is_ready_when_connected_and_logged_in() {
        let bundle = bundle(Some(101));
        let status = build_send_status(connected_room(), Some(&bundle), 100, 0);

        assert!(status.can_send);
        assert_eq!(status.reason, "可以发送");
        assert_eq!(status.room_id, Some(6));
        assert_eq!(status.anchor_name, Some("测试主播".to_string()));
    }

    #[test]
    fn send_status_reports_login_required() {
        let status = build_send_status(connected_room(), None, 100, 0);

        assert!(!status.can_send);
        assert_eq!(status.reason, "请先登录 B 站");
    }

    #[test]
    fn send_status_reports_cooldown() {
        let bundle = bundle(Some(101));
        let status = build_send_status(connected_room(), Some(&bundle), 100, 1500);

        assert!(!status.can_send);
        assert_eq!(status.reason, "已发送，稍后可继续发送");
        assert_eq!(status.cooldown_ms, 1500);
    }

    #[test]
    fn remembers_last_send_result_without_text_or_secret() {
        let state = SendDanmakuState::default();

        state.remember_result(
            Some(-111),
            Some("登录状态失效，请重新登录 B 站后再试".to_string()),
        );

        let snapshot = state.last_result_snapshot();
        assert_eq!(snapshot.code, Some(-111));
        assert_eq!(
            snapshot.error,
            Some("登录状态失效，请重新登录 B 站后再试".to_string())
        );
    }

    #[test]
    fn cooldown_blocks_fast_repeated_attempts() {
        let now = Instant::now();
        let remaining = cooldown_remaining(now, now + Duration::from_secs(1)).unwrap();

        assert!(remaining > Duration::from_secs(1));
    }

    #[test]
    fn cooldown_allows_after_interval() {
        let now = Instant::now();

        assert!(cooldown_remaining(now, now + SEND_COOLDOWN).is_none());
    }

    #[test]
    fn status_sync_keeps_room_for_auth_success_without_room_id() {
        let state = SendDanmakuState::default();
        state
            .sync_status(&DanmakuStatus {
                status: "connected".to_string(),
                message: "已连接".to_string(),
                room_id: Some(6),
                anchor_name: Some("测试主播".to_string()),
                live_status: Some(1),
            })
            .unwrap();
        state
            .sync_status(&DanmakuStatus {
                status: "connected".to_string(),
                message: "认证成功".to_string(),
                room_id: None,
                anchor_name: None,
                live_status: None,
            })
            .unwrap();

        assert_eq!(state.room_snapshot().unwrap(), connected_room());
    }

    #[test]
    fn status_sync_clears_room_when_disconnected() {
        let state = SendDanmakuState::default();
        state
            .sync_status(&DanmakuStatus {
                status: "connected".to_string(),
                message: "已连接".to_string(),
                room_id: Some(6),
                anchor_name: None,
                live_status: Some(1),
            })
            .unwrap();
        state
            .sync_status(&DanmakuStatus {
                status: "disconnected".to_string(),
                message: "已断开".to_string(),
                room_id: None,
                anchor_name: None,
                live_status: None,
            })
            .unwrap();

        assert_eq!(state.room_snapshot().unwrap(), CurrentRoomState::default());
    }
}
