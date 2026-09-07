mod diagnostics;
mod request;
mod state;
mod validation;

use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::room_manager::{RoomConnectionManager, RoomSessionSnapshot, RoomSessionStatus};
use super::session;

pub use state::SendDanmakuState;

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
    pub status: Option<RoomSessionStatus>,
    pub cooldown_ms: u64,
}

#[tauri::command]
pub async fn send_bilibili_danmaku(
    app: AppHandle,
    state: tauri::State<'_, SendDanmakuState>,
    room_id: u64,
    text: String,
) -> Result<SendDanmakuResult, String> {
    let manager = app.state::<RoomConnectionManager>();
    let target = match find_target_snapshot(&manager, room_id) {
        Ok(target) => target,
        Err(error) => {
            state.remember_result(None, Some(error.clone()));
            return Err(error);
        }
    };
    if let Err(error) = validation::validate_target(target.clone()) {
        state.remember_result(None, Some(error.clone()));
        return Err(error);
    }
    let room = match manager.connected_room(room_id) {
        Ok(room) => room,
        Err(_) => {
            let error = "目标直播间未连接".to_string();
            state.remember_result(None, Some(error.clone()));
            return Err(error);
        }
    };
    let expected_session_id = room.session_id.clone();
    let bundle = match session::load_cookie_bundle() {
        Ok(bundle) => bundle,
        Err(error) => {
            state.remember_result(None, Some(error.clone()));
            return Err(error);
        }
    };
    let context =
        match validation::build_send_context(&text, room, bundle.as_ref(), state::now_unix()) {
            Ok(context) => context,
            Err(error) => {
                state.remember_result(None, Some(error.clone()));
                return Err(error);
            }
        };
    if let Err(error) = mark_send_attempt_for_target(
        &manager,
        &state,
        room_id,
        &expected_session_id,
        Instant::now(),
    ) {
        state.remember_result(None, Some(error.clone()));
        return Err(error);
    }

    match request::send_danmaku_request(&context).await {
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
    app: AppHandle,
    state: tauri::State<'_, SendDanmakuState>,
    room_id: Option<u64>,
) -> Result<SendDanmakuStatus, String> {
    let room = match room_id {
        Some(room_id) => find_target_snapshot(&app.state::<RoomConnectionManager>(), room_id)?,
        None => None,
    };
    let cooldown_ms = state.cooldown_remaining_ms(Instant::now())?;
    if room_id.is_none() {
        return Ok(validation::build_send_status(
            room,
            None,
            state::now_unix(),
            cooldown_ms,
        ));
    }

    if let Err(reason) = validation::validate_target(room.clone()) {
        return Ok(SendDanmakuStatus {
            can_send: false,
            reason,
            room_id: room.as_ref().and_then(|snapshot| snapshot.room_id),
            anchor_name: room
                .as_ref()
                .and_then(|snapshot| snapshot.anchor_name.clone()),
            status: room.as_ref().map(|snapshot| snapshot.status),
            cooldown_ms: 0,
        });
    }

    let bundle = session::load_cookie_bundle()?;
    Ok(validation::build_send_status(
        room,
        bundle.as_ref(),
        state::now_unix(),
        cooldown_ms,
    ))
}

pub(crate) fn diagnostic_lines(app: &AppHandle) -> Vec<String> {
    diagnostics::diagnostic_lines(app)
}

fn find_target_snapshot(
    manager: &RoomConnectionManager,
    room_id: u64,
) -> Result<Option<RoomSessionSnapshot>, String> {
    Ok(manager
        .snapshot()?
        .into_iter()
        .find(|snapshot| snapshot.room_id == Some(room_id)))
}

fn mark_send_attempt_for_target(
    manager: &RoomConnectionManager,
    state: &SendDanmakuState,
    room_id: u64,
    expected_session_id: &str,
    now: Instant,
) -> Result<(), String> {
    let current = manager
        .connected_room(room_id)
        .map_err(|_| "目标直播间未连接".to_string())?;
    if current.session_id != expected_session_id {
        return Err("目标直播间未连接".to_string());
    }
    state.mark_attempt(now)
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use crate::bilibili::room_manager::{RoomSessionSnapshot, RoomSessionStatus};

    use super::request::map_response_error;
    use super::state::{cooldown_remaining, SEND_COOLDOWN};
    use super::validation::{
        build_send_context, build_send_status, validate_target, validate_text,
    };
    use super::*;
    use crate::bilibili::cookies::BilibiliCookieBundle;

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

    fn snapshot(room_id: u64, status: RoomSessionStatus) -> RoomSessionSnapshot {
        RoomSessionSnapshot {
            session_id: format!("room-session-{room_id}"),
            requested_room_id: room_id,
            room_id: Some(room_id),
            anchor_name: Some("测试主播".to_string()),
            fan_medal_name: Some("粉丝牌".to_string()),
            status,
            message: "状态消息".to_string(),
            live_status: Some(1),
        }
    }

    fn connected_room() -> RoomSessionSnapshot {
        snapshot(6, RoomSessionStatus::Connected)
    }

    fn connect_manager_room(
        manager: &RoomConnectionManager,
        requested_room_id: u64,
        room_id: u64,
    ) -> super::super::room_manager::SessionLease {
        let lease = manager.reserve(requested_room_id).expect("reserve");
        manager
            .resolve_room(&lease, room_id, room_id + 1_000)
            .expect("resolve");
        manager
            .update_status(&lease, RoomSessionStatus::Connected, "connected", Some(1))
            .expect("connected");
        lease
    }

    #[test]
    fn empty_text_is_rejected() {
        let error = validate_text("   ").unwrap_err();

        assert_eq!(error, "请输入弹幕内容");
    }

    #[test]
    fn overlong_text_is_rejected() {
        let error = validate_text(&"好".repeat(validation::TEXT_LIMIT + 1)).unwrap_err();

        assert!(error.contains("不能超过"));
    }

    #[test]
    fn trims_valid_text() {
        let text = validate_text("  testtest  ").unwrap();

        assert_eq!(text, "testtest");
    }

    #[test]
    fn missing_target_is_rejected() {
        let error = validate_target(None).unwrap_err();

        assert_eq!(error, "请选择发送目标");
    }

    #[test]
    fn not_live_room_is_rejected() {
        let mut room = snapshot(6, RoomSessionStatus::NotLive);
        room.live_status = Some(0);
        let error = validate_target(Some(room)).unwrap_err();

        assert_eq!(error, "当前直播间未开播，暂不能发送");
    }

    #[test]
    fn connecting_room_is_rejected() {
        let error = validate_target(Some(snapshot(6, RoomSessionStatus::Connecting))).unwrap_err();

        assert_eq!(error, "目标直播间正在连接，请稍后再发送");
    }

    #[test]
    fn reconnecting_room_is_rejected() {
        let error =
            validate_target(Some(snapshot(6, RoomSessionStatus::Reconnecting))).unwrap_err();

        assert_eq!(error, "目标直播间正在重连，请稍后再发送");
    }

    #[test]
    fn invalid_room_is_rejected() {
        let error = validate_target(Some(snapshot(6, RoomSessionStatus::InvalidRoom))).unwrap_err();

        assert_eq!(error, "目标直播间不可用，请重新连接");
    }

    #[test]
    fn error_room_is_rejected() {
        let error = validate_target(Some(snapshot(6, RoomSessionStatus::Error))).unwrap_err();

        assert_eq!(error, "目标直播间连接异常，请重试");
    }

    #[test]
    fn missing_room_id_is_rejected() {
        let mut room = connected_room();
        room.room_id = None;
        let error = validate_target(Some(room)).unwrap_err();

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
        let status = build_send_status(Some(connected_room()), Some(&bundle), 100, 0);

        assert!(status.can_send);
        assert_eq!(status.reason, "可以发送");
        assert_eq!(status.room_id, Some(6));
        assert_eq!(status.anchor_name, Some("测试主播".to_string()));
        assert_eq!(status.status, Some(RoomSessionStatus::Connected));
    }

    #[test]
    fn send_status_reports_login_required() {
        let status = build_send_status(Some(connected_room()), None, 100, 0);

        assert!(!status.can_send);
        assert_eq!(status.reason, "请先登录 B 站");
    }

    #[test]
    fn send_status_reports_cooldown() {
        let bundle = bundle(Some(101));
        let status = build_send_status(Some(connected_room()), Some(&bundle), 100, 1500);

        assert!(!status.can_send);
        assert_eq!(status.reason, "已发送，稍后可继续发送");
        assert_eq!(status.cooldown_ms, 1500);
    }

    #[test]
    fn send_status_validates_target_before_auth() {
        let status = build_send_status(None, None, 100, 1500);

        assert!(!status.can_send);
        assert_eq!(status.reason, "请选择发送目标");
        assert_eq!(status.status, None);
        assert_eq!(status.cooldown_ms, 0);
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
    fn switching_target_does_not_bypass_global_cooldown() {
        let state = SendDanmakuState::default();
        let now = Instant::now();

        state.mark_attempt(now).expect("room 6 attempt");
        assert!(state.mark_attempt(now + Duration::from_secs(1)).is_err());
    }

    #[test]
    fn replaced_target_is_rejected_before_cooldown_or_dispatch() {
        let manager = RoomConnectionManager::default();
        let old_lease = connect_manager_room(&manager, 6, 6);
        let old_target = manager.connected_room(6).expect("old target");
        manager
            .invalidate(&old_lease.session_id)
            .expect("remove old target");
        let replacement = connect_manager_room(&manager, 6, 6);
        assert_ne!(old_target.session_id, replacement.session_id);

        let state = SendDanmakuState::default();
        let now = Instant::now();
        let mut dispatched = false;
        let result = mark_send_attempt_for_target(&manager, &state, 6, &old_target.session_id, now)
            .map(|_| {
                dispatched = true;
            });

        assert_eq!(
            result.expect_err("replacement must reject old send"),
            "目标直播间未连接"
        );
        assert_eq!(state.cooldown_remaining_ms(now).expect("cooldown"), 0);
        assert!(!dispatched);
    }
}
