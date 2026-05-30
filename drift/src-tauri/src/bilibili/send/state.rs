use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::bilibili::types::DanmakuStatus;

pub(super) const SEND_COOLDOWN: Duration = Duration::from_secs(3);

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
    pub(super) fn sync_status(&self, event: &DanmakuStatus) -> Result<(), String> {
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

    pub(super) fn room_snapshot(&self) -> Result<CurrentRoomState, String> {
        self.current_room
            .lock()
            .map(|room| room.clone())
            .map_err(|error| format!("发送状态读取失败：{}", error))
    }

    pub(super) fn mark_attempt(&self, now: Instant) -> Result<(), String> {
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

    pub(super) fn cooldown_remaining_ms(&self, now: Instant) -> Result<u64, String> {
        let last_attempt_at = self
            .last_attempt_at
            .lock()
            .map_err(|error| format!("发送冷却状态读取失败：{}", error))?;

        Ok(last_attempt_at
            .and_then(|last_attempt_at| cooldown_remaining(last_attempt_at, now))
            .map(|remaining| remaining.as_millis() as u64)
            .unwrap_or(0))
    }

    pub(super) fn remember_result(&self, code: Option<i32>, error: Option<String>) {
        if let Ok(mut last_result) = self.last_result.lock() {
            *last_result = LastSendDiagnostic { code, error };
        }
    }

    pub(super) fn last_result_snapshot(&self) -> LastSendDiagnostic {
        self.last_result
            .lock()
            .map(|result| result.clone())
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct CurrentRoomState {
    pub(super) status: String,
    pub(super) room_id: Option<u64>,
    pub(super) anchor_name: Option<String>,
    pub(super) live_status: Option<u8>,
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

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct LastSendDiagnostic {
    pub(super) code: Option<i32>,
    pub(super) error: Option<String>,
}

pub(super) fn cooldown_remaining(last_attempt_at: Instant, now: Instant) -> Option<Duration> {
    let elapsed = now.saturating_duration_since(last_attempt_at);
    if elapsed >= SEND_COOLDOWN {
        None
    } else {
        Some(SEND_COOLDOWN - elapsed)
    }
}

pub(super) fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}
