use std::time::Instant;

use reqwest::header::{ACCEPT, CONTENT_TYPE, ORIGIN, REFERER, USER_AGENT};
use serde::Deserialize;
use tracing::{info, warn};

use crate::bilibili::types::BROWSER_USER_AGENT;

use super::state::{now_unix, SEND_COOLDOWN};
use super::validation::SendRequestContext;
use super::SendDanmakuResult;

const SEND_DANMAKU_URL: &str = "https://api.live.bilibili.com/msg/send";

#[derive(Debug, Deserialize)]
struct SendDanmakuResponse {
    code: i32,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    msg: Option<String>,
    data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SendDanmakuError {
    pub(super) code: Option<i32>,
    pub(super) message: String,
}

impl SendDanmakuError {
    fn new(code: Option<i32>, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

pub(super) async fn send_danmaku_request(
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

pub(super) fn map_response_error(code: i32, message: &str) -> String {
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
