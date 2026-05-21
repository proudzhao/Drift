use super::errors::classify_connection_error;
use super::http;
use super::protocol;
use super::types::{
    ConnectionResult, DanmakuMessage, DanmakuStatus, DanmakuTaskState,
    HEARTBEAT_INTERVAL, DANMAKU_BUFFER_MAX, DANMAKU_FLUSH_INTERVAL,
    RECONNECT_DELAYS,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, info, warn};

// ── Tauri commands ──

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

// ── Connection loop ──

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

async fn connect_room(app: AppHandle, room_id: u64) -> Result<ConnectionResult, String> {
    let room_init = http::fetch_room_init(room_id).await?;
    let room_id = room_init.room_id;
    info!(
        target: "drift::bilibili.http",
        room_id,
        anchor_uid = room_init.uid,
        live_status = room_init.live_status,
        "resolved room init info"
    );
    let device = http::fetch_buvid().await?;
    let anchor_name = http::resolve_anchor_name(room_id, room_init.uid, &device.cookie).await;

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

    let danmu_info = http::fetch_danmu_info(room_id, &device.cookie).await?;
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
            protocol::build_packet(7, 1, auth_body.to_string().as_bytes()).into(),
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
    let mut danmaku_buffer: Vec<DanmakuMessage> = Vec::new();
    let mut danmaku_flush = tokio::time::interval(DANMAKU_FLUSH_INTERVAL);

    let status_emitter = |app: &AppHandle, s: &str, m: &str| {
        emit_status(app, s, m);
    };

    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                debug!(target: "drift::bilibili.ws", room_id, "sending heartbeat");
                writer
                    .send(Message::Binary(
                        protocol::build_packet(2, 1, b"[Object object]").into(),
                    ))
                    .await
                    .map_err(|error| format!("心跳发送失败：{}", error))?;
            }
            _ = danmaku_flush.tick() => {
                if !danmaku_buffer.is_empty() {
                    let batch: Vec<DanmakuMessage> = danmaku_buffer.drain(..).collect();
                    debug!(target: "drift::bilibili.ws", count = batch.len(), "flushing danmaku batch");
                    if let Err(error) = app.emit("danmaku-messages", batch) {
                        error!(target: "drift::danmaku", error = %error, "danmaku-messages emit failed");
                    }
                }
            }
            message = reader.next() => {
                match message {
                    Some(Ok(Message::Binary(bytes))) => {
                        let messages = protocol::handle_packet(&app, &status_emitter, &bytes)?;
                        danmaku_buffer.extend(messages);
                        if danmaku_buffer.len() >= DANMAKU_BUFFER_MAX {
                            let batch: Vec<DanmakuMessage> = danmaku_buffer.drain(..).collect();
                            warn!(target: "drift::bilibili.ws", count = batch.len(), "danmaku buffer overflow, emergency flush");
                            if let Err(error) = app.emit("danmaku-messages", batch) {
                                error!(target: "drift::danmaku", error = %error, "danmaku-messages emit failed");
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) => return Err("服务器关闭连接".to_string()),
                    Some(Ok(_)) => {}
                    Some(Err(error)) => return Err(format!("WebSocket 读取失败：{}", error)),
                    None => return Err("WebSocket 连接结束".to_string()),
                }
            }
        }
    }
}

// ── Status emitters ──

pub(crate) fn emit_status(app: &AppHandle, status: &str, message: impl Into<String>) {
    let event = DanmakuStatus {
        status: status.to_string(),
        message: message.into(),
        room_id: None,
        anchor_name: None,
        live_status: None,
    };
    emit_status_event(app, event);
}

pub(crate) fn emit_room_status(
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
