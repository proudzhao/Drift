mod diagnostics;
mod request;
mod state;
mod validation;

use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tracing::warn;

use super::session;
use super::types::DanmakuStatus;

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
    pub status: String,
    pub cooldown_ms: u64,
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
    let context =
        match validation::build_send_context(&text, room, bundle.as_ref(), state::now_unix()) {
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
    state: tauri::State<'_, SendDanmakuState>,
) -> Result<SendDanmakuStatus, String> {
    let room = state.room_snapshot()?;
    let cooldown_ms = state.cooldown_remaining_ms(Instant::now())?;
    let bundle = session::load_cookie_bundle()?;
    Ok(validation::build_send_status(
        room,
        bundle.as_ref(),
        state::now_unix(),
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
    diagnostics::diagnostic_lines(app)
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::request::map_response_error;
    use super::state::{cooldown_remaining, CurrentRoomState, SEND_COOLDOWN};
    use super::validation::{build_send_context, build_send_status, validate_room, validate_text};
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
        let error = validate_text(&"好".repeat(validation::TEXT_LIMIT + 1)).unwrap_err();

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
