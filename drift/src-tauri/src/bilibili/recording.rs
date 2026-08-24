use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{DateTime, Local};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::fs::{self, File, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;

use super::types::{LiveMessage, LiveMessageKind};

const RECORDING_CHANNEL_CAPACITY: usize = 64;
const RECORDING_STATUS_EVENT: &str = "danmaku-recording-status";
const RECORDING_DIR_NAME: &str = "danmaku-records";
const UNKNOWN_ANCHOR_NAME: &str = "未知主播";
const MAX_ANCHOR_NAME_CHARS: usize = 80;
const MAX_ANCHOR_NAME_BYTES: usize = 180;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DanmakuRecordingState {
    Disabled,
    Waiting,
    Recording,
    Error,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DanmakuRecordingStatus {
    pub enabled: bool,
    pub state: DanmakuRecordingState,
    pub current_file_name: Option<String>,
    pub error_message: Option<String>,
}

impl Default for DanmakuRecordingStatus {
    fn default() -> Self {
        Self {
            enabled: false,
            state: DanmakuRecordingState::Disabled,
            current_file_name: None,
            error_message: None,
        }
    }
}

struct RecordBatch {
    room_id: u64,
    anchor_name: Option<String>,
    at: DateTime<Local>,
    messages: Vec<LiveMessage>,
}

#[derive(Default)]
struct RecorderInner {
    status: DanmakuRecordingStatus,
    sender: Option<mpsc::Sender<RecordBatch>>,
}

#[derive(Default)]
pub struct DanmakuRecorder {
    inner: Mutex<RecorderInner>,
}

struct TryRecordOutcome {
    accepted: bool,
    status_change: Option<DanmakuRecordingStatus>,
}

pub(crate) fn preserve_event_batch(
    messages: Vec<LiveMessage>,
    record: impl FnOnce(Vec<LiveMessage>) -> bool,
) -> Vec<LiveMessage> {
    let _ = record(messages.clone());
    messages
}

impl DanmakuRecorder {
    #[cfg(test)]
    fn with_sender(enabled: bool, sender: mpsc::Sender<RecordBatch>) -> Self {
        let recorder = Self::default();
        recorder
            .configure(enabled, sender)
            .expect("configure test recorder");
        recorder
    }

    fn configure(&self, enabled: bool, sender: mpsc::Sender<RecordBatch>) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        inner.sender = Some(sender);
        inner.status = DanmakuRecordingStatus {
            enabled,
            state: if enabled {
                DanmakuRecordingState::Waiting
            } else {
                DanmakuRecordingState::Disabled
            },
            current_file_name: None,
            error_message: None,
        };
        Ok(())
    }

    pub(crate) fn snapshot(&self) -> Result<DanmakuRecordingStatus, String> {
        self.inner
            .lock()
            .map(|inner| inner.status.clone())
            .map_err(|error| error.to_string())
    }

    fn try_record_outcome(
        &self,
        room_id: u64,
        anchor_name: Option<&str>,
        at: DateTime<Local>,
        messages: Vec<LiveMessage>,
    ) -> Result<TryRecordOutcome, String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if !inner.status.enabled || inner.status.state == DanmakuRecordingState::Error {
            return Ok(TryRecordOutcome {
                accepted: false,
                status_change: None,
            });
        }

        let batch = RecordBatch {
            room_id,
            anchor_name: anchor_name.map(str::to_owned),
            at,
            messages,
        };
        let result = match inner.sender.as_ref() {
            Some(sender) => sender.try_send(batch),
            None => Err(mpsc::error::TrySendError::Closed(batch)),
        };

        match result {
            Ok(()) => Ok(TryRecordOutcome {
                accepted: true,
                status_change: None,
            }),
            Err(error) => {
                let error_message = match error {
                    mpsc::error::TrySendError::Full(_) => "记录队列已满，记录已暂停".to_string(),
                    mpsc::error::TrySendError::Closed(_) => {
                        "记录服务不可用，记录已暂停".to_string()
                    }
                };
                let status_change = set_error_locked(&mut inner, error_message);
                Ok(TryRecordOutcome {
                    accepted: false,
                    status_change,
                })
            }
        }
    }

    #[cfg(test)]
    fn try_record_batch(
        &self,
        room_id: u64,
        anchor_name: Option<&str>,
        at: DateTime<Local>,
        messages: Vec<LiveMessage>,
    ) -> bool {
        self.try_record_outcome(room_id, anchor_name, at, messages)
            .map(|outcome| outcome.accepted)
            .unwrap_or(false)
    }

    pub(crate) fn try_record(
        &self,
        app: &AppHandle,
        room_id: u64,
        anchor_name: Option<&str>,
        at: DateTime<Local>,
        messages: Vec<LiveMessage>,
    ) -> bool {
        match self.try_record_outcome(room_id, anchor_name, at, messages) {
            Ok(outcome) => {
                if let Some(status) = outcome.status_change {
                    emit_recording_status(app, &status);
                }
                outcome.accepted
            }
            Err(error) => {
                tracing::error!(
                    target: "drift::recording",
                    room_id,
                    error = %error,
                    "failed to access danmaku recorder state"
                );
                false
            }
        }
    }

    fn set_enabled(&self, enabled: bool) -> Result<Option<DanmakuRecordingStatus>, String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if inner.status.enabled == enabled {
            return Ok(None);
        }
        inner.status = DanmakuRecordingStatus {
            enabled,
            state: if enabled {
                DanmakuRecordingState::Waiting
            } else {
                DanmakuRecordingState::Disabled
            },
            current_file_name: None,
            error_message: None,
        };
        Ok(Some(inner.status.clone()))
    }

    fn retry_change(&self) -> Result<Option<DanmakuRecordingStatus>, String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if !inner.status.enabled || inner.status.state != DanmakuRecordingState::Error {
            return Ok(None);
        }
        inner.status.state = DanmakuRecordingState::Waiting;
        inner.status.error_message = None;
        Ok(Some(inner.status.clone()))
    }

    #[cfg(test)]
    fn retry(&self) -> Result<DanmakuRecordingStatus, String> {
        let _ = self.retry_change()?;
        self.snapshot()
    }

    fn record_success(&self, file_name: &str) -> Result<Option<DanmakuRecordingStatus>, String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if !inner.status.enabled || inner.status.state == DanmakuRecordingState::Error {
            return Ok(None);
        }
        let next = DanmakuRecordingStatus {
            enabled: true,
            state: DanmakuRecordingState::Recording,
            current_file_name: Some(file_name.to_string()),
            error_message: None,
        };
        if inner.status == next {
            return Ok(None);
        }
        inner.status = next;
        Ok(Some(inner.status.clone()))
    }

    fn record_error(
        &self,
        error_message: String,
    ) -> Result<Option<DanmakuRecordingStatus>, String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if !inner.status.enabled {
            return Ok(None);
        }
        Ok(set_error_locked(&mut inner, error_message))
    }
}

fn set_error_locked(
    inner: &mut RecorderInner,
    error_message: String,
) -> Option<DanmakuRecordingStatus> {
    if inner.status.state == DanmakuRecordingState::Error {
        return None;
    }
    inner.status.state = DanmakuRecordingState::Error;
    inner.status.error_message = Some(error_message);
    Some(inner.status.clone())
}

fn emit_recording_status(app: &AppHandle, status: &DanmakuRecordingStatus) {
    if let Err(error) = app.emit(RECORDING_STATUS_EVENT, status) {
        tracing::warn!(
            target: "drift::recording",
            error = %error,
            "failed to emit danmaku recording status"
        );
    }
}

fn recording_error_message(error: &std::io::Error) -> String {
    use std::io::ErrorKind;

    match error.kind() {
        ErrorKind::PermissionDenied => "记录目录或文件无访问权限，记录已暂停".to_string(),
        ErrorKind::NotFound => "记录目录或文件不可用，记录已暂停".to_string(),
        ErrorKind::StorageFull => "存储空间不足，记录已暂停".to_string(),
        _ => "记录文件写入失败，记录已暂停".to_string(),
    }
}

fn sanitize_anchor_name(anchor_name: Option<&str>) -> String {
    let mut replaced = String::new();
    let mut previous_underscore = false;

    for character in anchor_name.unwrap_or_default().trim().chars() {
        let character = if character.is_control()
            || matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
            '_'
        } else {
            character
        };
        if character == '_' && previous_underscore {
            continue;
        }
        previous_underscore = character == '_';
        replaced.push(character);
    }

    let replaced = replaced.trim_end_matches(|character| character == ' ' || character == '.');
    let mut sanitized = String::new();
    for character in replaced.chars().take(MAX_ANCHOR_NAME_CHARS) {
        if sanitized.len() + character.len_utf8() > MAX_ANCHOR_NAME_BYTES {
            break;
        }
        sanitized.push(character);
    }
    while sanitized.ends_with(' ') || sanitized.ends_with('.') {
        sanitized.pop();
    }

    if sanitized.is_empty() {
        UNKNOWN_ANCHOR_NAME.to_string()
    } else {
        sanitized
    }
}

fn record_file_name(room_id: u64, anchor_name: Option<&str>, at: DateTime<Local>) -> String {
    let anchor_name = sanitize_anchor_name(anchor_name);
    format!("{}-{room_id}-{anchor_name}.txt", at.format("%Y-%m-%d"))
}

async fn run_worker(
    app: AppHandle,
    mut receiver: mpsc::Receiver<RecordBatch>,
    mut writer: RecordingWriter,
) {
    while let Some(batch) = receiver.recv().await {
        match writer
            .write_batch(
                batch.room_id,
                batch.anchor_name.as_deref(),
                batch.at,
                &batch.messages,
            )
            .await
        {
            Ok(file_name) => {
                let recorder = app.state::<DanmakuRecorder>();
                match recorder.record_success(&file_name) {
                    Ok(Some(status)) => emit_recording_status(&app, &status),
                    Ok(None) => {}
                    Err(error) => tracing::error!(
                        target: "drift::recording",
                        room_id = batch.room_id,
                        error = %error,
                        "failed to update danmaku recording success state"
                    ),
                }
            }
            Err(error) => {
                tracing::error!(
                    target: "drift::recording",
                    room_id = batch.room_id,
                    error_kind = ?error.kind(),
                    "danmaku record batch write failed"
                );
                let recorder = app.state::<DanmakuRecorder>();
                match recorder.record_error(recording_error_message(&error)) {
                    Ok(Some(status)) => emit_recording_status(&app, &status),
                    Ok(None) => {}
                    Err(state_error) => tracing::error!(
                        target: "drift::recording",
                        room_id = batch.room_id,
                        error = %state_error,
                        "failed to update danmaku recording error state"
                    ),
                }
            }
        }
    }
}

pub(crate) fn setup(app: &mut tauri::App) -> Result<(), String> {
    let enabled = crate::app_config::read_app_config(app.handle())?
        .recording
        .enabled;
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("记录目录获取失败：{error}"))?
        .join(RECORDING_DIR_NAME);
    let (sender, receiver) = mpsc::channel(RECORDING_CHANNEL_CAPACITY);
    app.state::<DanmakuRecorder>().configure(enabled, sender)?;
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(run_worker(
        app_handle,
        receiver,
        RecordingWriter::new(base_dir),
    ));
    Ok(())
}

#[tauri::command]
pub fn get_danmaku_recording_status(
    state: tauri::State<'_, DanmakuRecorder>,
) -> Result<DanmakuRecordingStatus, String> {
    state.snapshot()
}

#[tauri::command]
pub fn set_danmaku_recording_enabled(
    app: AppHandle,
    state: tauri::State<'_, DanmakuRecorder>,
    enabled: bool,
) -> Result<DanmakuRecordingStatus, String> {
    let mut config = crate::app_config::read_app_config(&app)?;
    config.recording.enabled = enabled;
    crate::app_config::save_app_config(app.clone(), config)?;

    if let Some(status) = state.set_enabled(enabled)? {
        emit_recording_status(&app, &status);
    }
    state.snapshot()
}

#[tauri::command]
pub fn retry_danmaku_recording(
    app: AppHandle,
    state: tauri::State<'_, DanmakuRecorder>,
) -> Result<DanmakuRecordingStatus, String> {
    if let Some(status) = state.retry_change()? {
        emit_recording_status(&app, &status);
    }
    state.snapshot()
}

#[tauri::command]
pub fn open_danmaku_record_dir(app: AppHandle) -> Result<(), String> {
    let record_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("记录目录获取失败：{error}"))?
        .join(RECORDING_DIR_NAME);
    std::fs::create_dir_all(&record_dir).map_err(|error| format!("记录目录创建失败：{error}"))?;
    app.opener()
        .open_path(record_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| format!("记录目录打开失败：{error}"))
}

fn one_line(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn guard_content(message: &LiveMessage) -> String {
    let prefix = format!("{} ", message.user);
    one_line(message.text.strip_prefix(&prefix).unwrap_or(&message.text))
}

fn format_message_line(message: &LiveMessage, at: DateTime<Local>) -> String {
    let time = at.format("%H:%M:%S");
    let user = one_line(&message.user);

    match message.kind {
        LiveMessageKind::Danmaku => {
            format!("[{time}] {user}：{}\n", one_line(&message.text))
        }
        LiveMessageKind::SuperChat => match message.super_chat_price {
            Some(price) => format!(
                "[{time}] [SC ¥{price}] {user}：{}\n",
                one_line(&message.text)
            ),
            None => format!("[{time}] [SC] {user}：{}\n", one_line(&message.text)),
        },
        LiveMessageKind::Gift => format!(
            "[{time}] [礼物] {user}：{} × {}\n",
            one_line(message.gift_name.as_deref().unwrap_or("礼物")),
            message.gift_count.unwrap_or(1)
        ),
        LiveMessageKind::Guard => {
            format!("[{time}] [上舰] {user}：{}\n", guard_content(message))
        }
    }
}

pub(crate) struct RecordingWriter {
    base_dir: PathBuf,
    current_key: Option<(String, u64, String)>,
    current_file_name: Option<String>,
    file: Option<File>,
}

impl RecordingWriter {
    pub(crate) fn new(base_dir: PathBuf) -> Self {
        Self {
            base_dir,
            current_key: None,
            current_file_name: None,
            file: None,
        }
    }

    pub(crate) async fn write_batch(
        &mut self,
        room_id: u64,
        anchor_name: Option<&str>,
        at: DateTime<Local>,
        messages: &[LiveMessage],
    ) -> std::io::Result<String> {
        let date = at.format("%Y-%m-%d").to_string();
        let anchor_name = sanitize_anchor_name(anchor_name);
        let key = (date, room_id, anchor_name.clone());
        let file_name = record_file_name(room_id, Some(&anchor_name), at);

        if self.current_key.as_ref() != Some(&key) {
            if let Some(file) = self.file.as_mut() {
                file.flush().await?;
            }

            fs::create_dir_all(&self.base_dir).await?;
            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.base_dir.join(&file_name))
                .await?;
            self.current_key = Some(key);
            self.current_file_name = Some(file_name.clone());
            self.file = Some(file);
        }

        let mut content = String::new();
        for message in messages {
            content.push_str(&format_message_line(message, at));
        }

        let file = self.file.as_mut().expect("recording file is open");
        file.write_all(content.as_bytes()).await?;
        file.flush().await?;

        Ok(self
            .current_file_name
            .clone()
            .expect("recording file name is set"))
    }
}

#[cfg(test)]
mod tests {
    use std::io;

    use chrono::{Local, TimeZone};
    use tempfile::tempdir;
    use tokio::sync::mpsc;

    use super::{
        format_message_line, preserve_event_batch, record_file_name, recording_error_message,
        sanitize_anchor_name, DanmakuRecorder, DanmakuRecordingState, RecordingWriter,
    };
    use crate::bilibili::sc_dedup::SuperChatDedupWindow;
    use crate::bilibili::types::{LiveMessage, LiveMessageKind};

    fn message(kind: LiveMessageKind, user: &str, text: &str) -> LiveMessage {
        LiveMessage {
            id: "test-message".to_string(),
            room_id: Some(6),
            sender_uid: None,
            current_room_fan_medal: None,
            current_room_fan_medal_level: None,
            kind,
            user: user.to_string(),
            text: text.to_string(),
            segments: None,
            is_self: false,
            timestamp: None,
            gift_name: None,
            gift_count: None,
            guard_level: None,
            guard_name: None,
            super_chat_price: None,
            super_chat_duration: None,
            super_chat_color: None,
            source_command: None,
            source_message_id: None,
        }
    }

    fn danmaku(user: &str, text: &str) -> LiveMessage {
        message(LiveMessageKind::Danmaku, user, text)
    }

    fn super_chat(user: &str, text: &str, price: Option<u64>) -> LiveMessage {
        LiveMessage {
            super_chat_price: price,
            ..message(LiveMessageKind::SuperChat, user, text)
        }
    }

    fn sourced_super_chat(source_id: &str, command: &str) -> LiveMessage {
        LiveMessage {
            source_command: Some(command.to_string()),
            source_message_id: Some(source_id.to_string()),
            ..super_chat("李四", "醒目留言", Some(100))
        }
    }

    fn gift(user: &str, gift_name: &str, gift_count: u64) -> LiveMessage {
        LiveMessage {
            gift_name: Some(gift_name.to_string()),
            gift_count: Some(gift_count),
            ..message(LiveMessageKind::Gift, user, "gift text")
        }
    }

    fn guard(user: &str, text: &str) -> LiveMessage {
        message(LiveMessageKind::Guard, user, text)
    }

    #[test]
    fn formats_four_message_kinds_and_sanitizes_one_line() {
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        assert_eq!(
            format_message_line(&danmaku("张\t三", "普通\n弹幕"), at),
            "[20:15:03] 张 三：普通 弹幕\n"
        );
        assert_eq!(
            format_message_line(&super_chat("李四", "醒目留言", Some(100)), at),
            "[20:15:03] [SC ¥100] 李四：醒目留言\n"
        );
        assert_eq!(
            format_message_line(&super_chat("李四", "无价格", None), at),
            "[20:15:03] [SC] 李四：无价格\n"
        );
        assert_eq!(
            format_message_line(&gift("王五", "小\r花", 3), at),
            "[20:15:03] [礼物] 王五：小 花 × 3\n"
        );
        assert_eq!(
            format_message_line(&guard("赵六", "赵六 开通 舰长"), at),
            "[20:15:03] [上舰] 赵六：开通 舰长\n"
        );
    }

    #[test]
    fn guard_content_only_removes_the_exact_user_prefix() {
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        assert_eq!(
            format_message_line(&guard("赵六", "赵六号 开通 舰长"), at),
            "[20:15:03] [上舰] 赵六：赵六号 开通 舰长\n"
        );
    }

    #[test]
    fn sanitizes_anchor_names_for_cross_platform_file_names() {
        assert_eq!(
            sanitize_anchor_name(Some(" 主/播\\名:*?\"<>| ")),
            "主_播_名_"
        );
        assert_eq!(sanitize_anchor_name(Some("主\n播")), "主_播");
        assert_eq!(sanitize_anchor_name(None), "未知主播");
        assert_eq!(sanitize_anchor_name(Some(" ... ")), "未知主播");
    }

    #[test]
    fn limits_anchor_names_by_characters_and_utf8_bytes() {
        let ascii = "a".repeat(100);
        let cjk = "界".repeat(100);

        assert_eq!(sanitize_anchor_name(Some(&ascii)).chars().count(), 80);
        assert_eq!(sanitize_anchor_name(Some(&cjk)).chars().count(), 60);
        assert_eq!(sanitize_anchor_name(Some(&cjk)).len(), 180);
    }

    #[test]
    fn builds_record_file_name_with_room_and_anchor() {
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        assert_eq!(
            record_file_name(545068, Some("老实憨厚的笑笑"), at),
            "2026-08-23-545068-老实憨厚的笑笑.txt"
        );
        assert_eq!(
            record_file_name(545068, None, at),
            "2026-08-23-545068-未知主播.txt"
        );
    }

    #[tokio::test]
    async fn appends_same_room_and_date_to_one_file() {
        let temp = tempdir().expect("temp dir");
        let mut writer = RecordingWriter::new(temp.path().to_path_buf());
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        let first_name = writer
            .write_batch(6, Some("示例主播"), at, &[danmaku("张三", "第一条")])
            .await
            .expect("write first batch");
        let second_name = writer
            .write_batch(6, Some("示例主播"), at, &[danmaku("李四", "第二条")])
            .await
            .expect("write second batch");

        assert_eq!(first_name, "2026-08-23-6-示例主播.txt");
        assert_eq!(second_name, first_name);
        assert_eq!(
            tokio::fs::read_to_string(temp.path().join(&first_name))
                .await
                .expect("read record"),
            "[20:15:03] 张三：第一条\n[20:15:03] 李四：第二条\n"
        );
    }

    #[tokio::test]
    async fn switches_files_when_date_room_or_anchor_changes() {
        let temp = tempdir().expect("temp dir");
        let mut writer = RecordingWriter::new(temp.path().to_path_buf());
        let first_day = Local.with_ymd_and_hms(2026, 8, 23, 23, 59, 59).unwrap();
        let second_day = Local.with_ymd_and_hms(2026, 8, 24, 0, 0, 1).unwrap();

        writer
            .write_batch(6, Some("示例主播"), first_day, &[danmaku("张三", "第一天")])
            .await
            .expect("write first day");
        let next_day_name = writer
            .write_batch(
                6,
                Some("示例主播"),
                second_day,
                &[danmaku("张三", "第二天")],
            )
            .await
            .expect("write next day");
        let next_room_name = writer
            .write_batch(
                7,
                Some("示例主播"),
                second_day,
                &[danmaku("李四", "另一个房间")],
            )
            .await
            .expect("write next room");
        let renamed_anchor = writer
            .write_batch(
                7,
                Some("新主播名"),
                second_day,
                &[danmaku("王五", "主播改名")],
            )
            .await
            .expect("write renamed anchor");

        assert_eq!(next_day_name, "2026-08-24-6-示例主播.txt");
        assert_eq!(next_room_name, "2026-08-24-7-示例主播.txt");
        assert_eq!(renamed_anchor, "2026-08-24-7-新主播名.txt");
        assert_eq!(
            tokio::fs::read_to_string(temp.path().join("2026-08-23-6-示例主播.txt"))
                .await
                .expect("read first day"),
            "[23:59:59] 张三：第一天\n"
        );
        assert_eq!(
            tokio::fs::read_to_string(temp.path().join(next_day_name))
                .await
                .expect("read second day"),
            "[00:00:01] 张三：第二天\n"
        );
        assert_eq!(
            tokio::fs::read_to_string(temp.path().join(next_room_name))
                .await
                .expect("read second room"),
            "[00:00:01] 李四：另一个房间\n"
        );
        assert_eq!(
            tokio::fs::read_to_string(temp.path().join(renamed_anchor))
                .await
                .expect("read renamed anchor"),
            "[00:00:01] 王五：主播改名\n"
        );
    }

    #[tokio::test]
    async fn leaves_legacy_room_only_file_untouched() {
        let temp = tempdir().expect("temp dir");
        let legacy = temp.path().join("2026-08-23-6.txt");
        tokio::fs::write(&legacy, "旧记录\n")
            .await
            .expect("seed legacy file");
        let mut writer = RecordingWriter::new(temp.path().to_path_buf());
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        let file_name = writer
            .write_batch(6, Some("示例主播"), at, &[danmaku("张三", "新记录")])
            .await
            .expect("write named record");

        assert_eq!(file_name, "2026-08-23-6-示例主播.txt");
        assert_eq!(
            tokio::fs::read_to_string(legacy)
                .await
                .expect("read legacy"),
            "旧记录\n"
        );
        assert_eq!(
            tokio::fs::read_to_string(temp.path().join(file_name))
                .await
                .expect("read named record"),
            "[20:15:03] 张三：新记录\n"
        );
    }

    #[test]
    fn disabled_recorder_rejects_batches_and_enabled_recorder_starts_waiting() {
        let (sender, mut receiver) = mpsc::channel(1);
        let disabled = DanmakuRecorder::with_sender(false, sender.clone());
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        assert!(!disabled.try_record_batch(
            6,
            Some("测试主播"),
            at,
            vec![danmaku("张三", "不会入队")],
        ));
        assert!(receiver.try_recv().is_err());
        assert_eq!(
            disabled.snapshot().expect("disabled snapshot").state,
            DanmakuRecordingState::Disabled
        );

        let enabled = DanmakuRecorder::with_sender(true, sender);
        assert_eq!(
            enabled.snapshot().expect("enabled snapshot").state,
            DanmakuRecordingState::Waiting
        );
    }

    #[test]
    fn full_channel_enters_error_and_retry_restores_waiting() {
        let (sender, _receiver) = mpsc::channel(1);
        let recorder = DanmakuRecorder::with_sender(true, sender);
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        assert!(recorder.try_record_batch(
            6,
            Some("测试主播"),
            at,
            vec![danmaku("张三", "第一批")],
        ));
        assert!(!recorder.try_record_batch(
            6,
            Some("测试主播"),
            at,
            vec![danmaku("李四", "第二批")],
        ));
        let failed = recorder.snapshot().expect("error snapshot");
        assert_eq!(failed.state, DanmakuRecordingState::Error);
        assert!(failed.error_message.is_some());

        assert!(!recorder.try_record_batch(
            6,
            Some("测试主播"),
            at,
            vec![danmaku("王五", "错误后拒绝")],
        ));
        assert_eq!(recorder.snapshot().expect("same error snapshot"), failed);

        let retried = recorder.retry().expect("retry");
        assert_eq!(retried.state, DanmakuRecordingState::Waiting);
        assert_eq!(retried.error_message, None);
    }

    #[test]
    fn deduplicated_super_chat_is_enqueued_once_for_recording() {
        let room_id = 22625025;
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();
        let (sender, mut receiver) = mpsc::channel(1);
        let recorder = DanmakuRecorder::with_sender(true, sender);
        let mut dedup = SuperChatDedupWindow::default();
        let batch = dedup.retain_new(
            room_id,
            vec![
                sourced_super_chat("10", "SUPER_CHAT_MESSAGE"),
                sourced_super_chat("10", "SUPER_CHAT_MESSAGE_JPN"),
            ],
        );

        let event_batch = preserve_event_batch(batch, |recording_batch| {
            recorder.try_record_batch(room_id, Some("示例主播"), at, recording_batch)
        });

        assert_eq!(event_batch.len(), 1);
        let recorded = receiver.try_recv().expect("deduplicated record batch");
        assert_eq!(recorded.room_id, room_id);
        assert_eq!(recorded.anchor_name.as_deref(), Some("示例主播"));
        assert_eq!(recorded.messages.len(), 1);
        assert_eq!(
            recorded.messages[0].source_message_id.as_deref(),
            Some("10")
        );
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn recorder_rejection_preserves_the_original_event_batch() {
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();
        let original = danmaku("张三", "仍需发送");

        let (disabled_sender, _disabled_receiver) = mpsc::channel(1);
        let disabled = DanmakuRecorder::with_sender(false, disabled_sender);
        let disabled_event = preserve_event_batch(vec![original.clone()], |recording_batch| {
            disabled.try_record_batch(6, Some("测试主播"), at, recording_batch)
        });
        assert_eq!(disabled_event.len(), 1);
        assert_eq!(disabled_event[0].text, original.text);

        let (full_sender, _full_receiver) = mpsc::channel(1);
        let full = DanmakuRecorder::with_sender(true, full_sender);
        assert!(full.try_record_batch(6, Some("测试主播"), at, vec![danmaku("李四", "占满队列")]));
        let full_event = preserve_event_batch(vec![original.clone()], |recording_batch| {
            full.try_record_batch(6, Some("测试主播"), at, recording_batch)
        });
        assert_eq!(full_event.len(), 1);
        assert_eq!(full_event[0].text, original.text);
        assert_eq!(
            full.snapshot().expect("full recorder status").state,
            DanmakuRecordingState::Error
        );

        let error_event = preserve_event_batch(vec![original.clone()], |recording_batch| {
            full.try_record_batch(6, Some("测试主播"), at, recording_batch)
        });
        assert_eq!(error_event.len(), 1);
        assert_eq!(error_event[0].text, original.text);
    }

    #[test]
    fn serialized_status_exposes_only_the_final_file_name() {
        let (sender, _receiver) = mpsc::channel(1);
        let recorder = DanmakuRecorder::with_sender(true, sender);
        recorder
            .record_success("2026-08-23-6-示例主播.txt")
            .expect("record success");
        let status = recorder.snapshot().expect("snapshot");
        assert_eq!(
            status.current_file_name.as_deref(),
            Some("2026-08-23-6-示例主播.txt")
        );

        let rendered = serde_json::to_string(&status).expect("serialize status");

        for forbidden in [
            "baseDir",
            "/Users/example",
            "张三",
            "弹幕正文",
            "senderUid",
            "cookie",
            "token",
        ] {
            assert!(!rendered.contains(forbidden), "leaked {forbidden}");
        }
    }

    #[test]
    fn converts_writer_errors_to_safe_user_messages() {
        assert_eq!(
            recording_error_message(&io::Error::from(io::ErrorKind::PermissionDenied)),
            "记录目录或文件无访问权限，记录已暂停"
        );
        assert_eq!(
            recording_error_message(&io::Error::from(io::ErrorKind::WriteZero)),
            "记录文件写入失败，记录已暂停"
        );
    }
}
