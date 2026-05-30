use crate::bilibili::cookies::BilibiliCookieBundle;
use crate::bilibili::session;

use super::state::CurrentRoomState;
use super::SendDanmakuStatus;

pub(super) const TEXT_LIMIT: usize = 60;

#[derive(Debug, Clone)]
pub(super) struct SendRequestContext {
    pub(super) room_id: u64,
    pub(super) text: String,
    pub(super) cookie_header: String,
    pub(super) csrf: String,
}

pub(super) fn build_send_context(
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

pub(super) fn build_send_status(
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

pub(super) fn validate_text(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("请输入弹幕内容".to_string());
    }

    if text.chars().count() > TEXT_LIMIT {
        return Err(format!("弹幕内容不能超过 {} 个字符", TEXT_LIMIT));
    }

    Ok(text.to_string())
}

pub(super) fn validate_room(room: CurrentRoomState) -> Result<u64, String> {
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
