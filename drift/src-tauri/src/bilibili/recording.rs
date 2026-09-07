use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex as StdMutex;

use chrono::{DateTime, Local};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::fs::{self, File, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, Mutex as AsyncMutex};

use super::types::{LiveMessage, LiveMessageKind};

const RECORDING_CHANNEL_CAPACITY: usize = 64;
const RECORDING_STATUS_EVENT: &str = "danmaku-recording-status";
const RECORDING_DIR_NAME: &str = "danmaku-records";
const UNKNOWN_ANCHOR_NAME: &str = "未知主播";
const MAX_ANCHOR_NAME_CHARS: usize = 80;
const MAX_ANCHOR_NAME_BYTES: usize = 180;
const MAX_ACTIVE_RECORDING_FILES: usize = 5;

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
pub struct ActiveRecordingFile {
    pub room_id: u64,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DanmakuRecordingStatus {
    pub enabled: bool,
    pub state: DanmakuRecordingState,
    pub active_files: Vec<ActiveRecordingFile>,
    pub error_message: Option<String>,
}

impl Default for DanmakuRecordingStatus {
    fn default() -> Self {
        Self {
            enabled: false,
            state: DanmakuRecordingState::Disabled,
            active_files: Vec::new(),
            error_message: None,
        }
    }
}

struct RecordBatch {
    epoch: u64,
    room_id: u64,
    anchor_name: Option<String>,
    at: DateTime<Local>,
    messages: Vec<LiveMessage>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RecorderState {
    enabled: bool,
    state: DanmakuRecordingState,
    error_message: Option<String>,
    epoch: u64,
    active_files: Vec<ActiveRecordingFile>,
}

impl Default for RecorderState {
    fn default() -> Self {
        Self {
            enabled: false,
            state: DanmakuRecordingState::Disabled,
            error_message: None,
            epoch: 0,
            active_files: Vec::new(),
        }
    }
}

impl RecorderState {
    fn status(&self) -> DanmakuRecordingStatus {
        DanmakuRecordingStatus {
            enabled: self.enabled,
            state: self.state.clone(),
            active_files: self.active_files.clone(),
            error_message: self.error_message.clone(),
        }
    }
}

struct RecorderInner {
    state: RecorderState,
    sender: Option<mpsc::Sender<RecordBatch>>,
}

impl Default for RecorderInner {
    fn default() -> Self {
        Self {
            state: RecorderState::default(),
            sender: None,
        }
    }
}

enum WorkerBatchOutcome {
    Discarded,
    Succeeded(Option<DanmakuRecordingStatus>),
    Failed {
        error: std::io::Error,
        status_change: Option<DanmakuRecordingStatus>,
    },
}

pub struct DanmakuRecorder {
    inner: StdMutex<RecorderInner>,
    writer: AsyncMutex<RecordingWriter>,
}

impl Default for DanmakuRecorder {
    fn default() -> Self {
        Self {
            inner: StdMutex::new(RecorderInner::default()),
            writer: AsyncMutex::new(RecordingWriter::new(PathBuf::new())),
        }
    }
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
    async fn with_sender(
        enabled: bool,
        sender: mpsc::Sender<RecordBatch>,
        base_dir: PathBuf,
    ) -> Self {
        let recorder = Self::default();
        recorder
            .configure_for_test(enabled, sender, base_dir)
            .await
            .expect("configure test recorder");
        recorder
    }

    fn configure(
        &self,
        enabled: bool,
        sender: mpsc::Sender<RecordBatch>,
        base_dir: PathBuf,
    ) -> Result<(), String> {
        let mut writer = self.writer.blocking_lock();
        writer.reset(base_dir);
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        inner.sender = Some(sender);
        inner.state = RecorderState {
            enabled,
            state: if enabled {
                DanmakuRecordingState::Waiting
            } else {
                DanmakuRecordingState::Disabled
            },
            error_message: None,
            epoch: 0,
            active_files: Vec::new(),
        };
        Ok(())
    }

    fn snapshot(&self) -> Result<DanmakuRecordingStatus, String> {
        self.inner
            .lock()
            .map(|inner| inner.state.status())
            .map_err(|error| error.to_string())
    }

    #[cfg(test)]
    async fn configure_for_test(
        &self,
        enabled: bool,
        sender: mpsc::Sender<RecordBatch>,
        base_dir: PathBuf,
    ) -> Result<(), String> {
        let mut writer = self.writer.lock().await;
        writer.reset(base_dir);
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        inner.sender = Some(sender);
        inner.state = RecorderState {
            enabled,
            state: if enabled {
                DanmakuRecordingState::Waiting
            } else {
                DanmakuRecordingState::Disabled
            },
            error_message: None,
            epoch: 0,
            active_files: Vec::new(),
        };
        Ok(())
    }

    fn try_record_outcome(
        &self,
        room_id: u64,
        anchor_name: Option<&str>,
        at: DateTime<Local>,
        messages: Vec<LiveMessage>,
    ) -> Result<TryRecordOutcome, String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if !inner.state.enabled || inner.state.state == DanmakuRecordingState::Error {
            return Ok(TryRecordOutcome {
                accepted: false,
                status_change: None,
            });
        }

        let previous_status = inner.state.status();
        let batch = RecordBatch {
            epoch: inner.state.epoch,
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
                let status_change = set_error_locked(&mut inner.state, error_message)
                    .map(|state| state.status())
                    .filter(|status| *status != previous_status);
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

    async fn set_enabled_change(
        &self,
        enabled: bool,
    ) -> Result<Option<DanmakuRecordingStatus>, String> {
        let mut writer = self.writer.lock().await;
        let (previous_status, next_state, should_clear) = {
            let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
            let previous_status = inner.state.status();
            if inner.state.enabled == enabled {
                return Ok(None);
            }
            let mut next_state = inner.state.clone();
            next_state.enabled = enabled;
            next_state.state = if enabled {
                DanmakuRecordingState::Waiting
            } else {
                DanmakuRecordingState::Disabled
            };
            next_state.error_message = None;
            if !enabled {
                next_state.epoch = next_state.epoch.wrapping_add(1);
                next_state.active_files.clear();
            }
            inner.state = next_state.clone();
            (previous_status, next_state, !enabled)
        };
        if should_clear {
            writer.clear();
        }
        let next_status = next_state.status();
        if next_status == previous_status {
            return Ok(None);
        }
        Ok(Some(next_status))
    }

    async fn retry_change(&self) -> Result<Option<DanmakuRecordingStatus>, String> {
        let mut writer = self.writer.lock().await;
        let (previous_status, next_state) = {
            let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
            if !inner.state.enabled || inner.state.state != DanmakuRecordingState::Error {
                return Ok(None);
            }
            let previous_status = inner.state.status();
            let mut next_state = inner.state.clone();
            next_state.state = DanmakuRecordingState::Waiting;
            next_state.error_message = None;
            next_state.epoch = next_state.epoch.wrapping_add(1);
            next_state.active_files.clear();
            inner.state = next_state.clone();
            (previous_status, next_state)
        };
        writer.clear();
        let next_status = next_state.status();
        if next_status == previous_status {
            return Ok(None);
        }
        Ok(Some(next_status))
    }

    #[cfg(test)]
    async fn retry(&self) -> Result<DanmakuRecordingStatus, String> {
        let _ = self.retry_change().await?;
        self.snapshot()
    }

    async fn process_batch(&self, batch: RecordBatch) -> Result<WorkerBatchOutcome, String> {
        let mut writer = self.writer.lock().await;
        let previous_state = self
            .inner
            .lock()
            .map_err(|error| error.to_string())?
            .state
            .clone();
        if !previous_state.enabled
            || previous_state.state == DanmakuRecordingState::Error
            || previous_state.epoch != batch.epoch
        {
            return Ok(WorkerBatchOutcome::Discarded);
        }
        let previous_status = previous_state.status();

        match writer
            .write_batch(
                batch.room_id,
                batch.anchor_name.as_deref(),
                batch.at,
                &batch.messages,
            )
            .await
        {
            Ok(_) => {
                let next_active_files = writer.active_files_snapshot();
                let next_state = {
                    let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
                    if !inner.state.enabled
                        || inner.state.state == DanmakuRecordingState::Error
                        || inner.state.epoch != batch.epoch
                    {
                        return Ok(WorkerBatchOutcome::Discarded);
                    }
                    inner.state.state = DanmakuRecordingState::Recording;
                    inner.state.error_message = None;
                    inner.state.active_files = next_active_files;
                    inner.state.clone()
                };
                let next_status = next_state.status();
                Ok(WorkerBatchOutcome::Succeeded(
                    (next_status != previous_status).then_some(next_status),
                ))
            }
            Err(error) => {
                let next_active_files = writer.active_files_snapshot();
                let status_change = {
                    let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
                    inner.state.active_files = next_active_files;
                    set_error_locked(&mut inner.state, recording_error_message(&error))
                        .map(|state| state.status())
                        .filter(|status| *status != previous_status)
                };
                Ok(WorkerBatchOutcome::Failed {
                    error,
                    status_change,
                })
            }
        }
    }

    #[cfg(test)]
    async fn record_error_for_test(
        &self,
        error_message: String,
    ) -> Result<Option<DanmakuRecordingStatus>, String> {
        let writer = self.writer.lock().await;
        let active_files = writer.active_files_snapshot();
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if !inner.state.enabled || inner.state.state == DanmakuRecordingState::Error {
            return Ok(None);
        }
        inner.state.active_files = active_files;
        let previous_status = inner.state.status();
        let next_status = set_error_locked(&mut inner.state, error_message)
            .map(|state| state.status())
            .filter(|status| *status != previous_status);
        Ok(next_status)
    }

    #[cfg(test)]
    async fn writer_active_file_count(&self) -> usize {
        self.writer.lock().await.active_files.len()
    }
}

fn set_error_locked(state: &mut RecorderState, error_message: String) -> Option<RecorderState> {
    if state.state == DanmakuRecordingState::Error {
        return None;
    }
    state.epoch = state.epoch.wrapping_add(1);
    state.state = DanmakuRecordingState::Error;
    state.error_message = Some(error_message);
    Some(state.clone())
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

async fn run_worker(app: AppHandle, mut receiver: mpsc::Receiver<RecordBatch>) {
    while let Some(batch) = receiver.recv().await {
        let room_id = batch.room_id;
        let recorder = app.state::<DanmakuRecorder>();
        match recorder.process_batch(batch).await {
            Ok(WorkerBatchOutcome::Discarded) => {}
            Ok(WorkerBatchOutcome::Succeeded(Some(status))) => emit_recording_status(&app, &status),
            Ok(WorkerBatchOutcome::Succeeded(None)) => {}
            Ok(WorkerBatchOutcome::Failed {
                error,
                status_change,
            }) => {
                tracing::error!(
                    target: "drift::recording",
                    room_id,
                    error_kind = ?error.kind(),
                    "danmaku record batch write failed"
                );
                if let Some(status) = status_change {
                    emit_recording_status(&app, &status);
                }
            }
            Err(error) => tracing::error!(
                target: "drift::recording",
                room_id,
                error = %error,
                "failed to process danmaku record batch"
            ),
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
    app.state::<DanmakuRecorder>()
        .configure(enabled, sender, base_dir)?;
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(run_worker(app_handle, receiver));
    Ok(())
}

#[tauri::command]
pub fn get_danmaku_recording_status(
    state: tauri::State<'_, DanmakuRecorder>,
) -> Result<DanmakuRecordingStatus, String> {
    state.snapshot()
}

#[tauri::command]
pub async fn set_danmaku_recording_enabled(
    app: AppHandle,
    state: tauri::State<'_, DanmakuRecorder>,
    enabled: bool,
) -> Result<DanmakuRecordingStatus, String> {
    crate::app_config::update_recording_enabled_config(&app, enabled)?;

    if let Some(status) = state.set_enabled_change(enabled).await? {
        emit_recording_status(&app, &status);
    }
    state.snapshot()
}

#[tauri::command]
pub async fn retry_danmaku_recording(
    app: AppHandle,
    state: tauri::State<'_, DanmakuRecorder>,
) -> Result<DanmakuRecordingStatus, String> {
    if let Some(status) = state.retry_change().await? {
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

struct ActiveRoomFile {
    key: (String, u64, String),
    file_name: String,
    file: File,
    last_used: u64,
}

pub(crate) struct RecordingWriter {
    base_dir: PathBuf,
    active_files: HashMap<u64, ActiveRoomFile>,
    next_use: u64,
}

impl RecordingWriter {
    pub(crate) fn new(base_dir: PathBuf) -> Self {
        Self {
            base_dir,
            active_files: HashMap::new(),
            next_use: 0,
        }
    }

    fn reset(&mut self, base_dir: PathBuf) {
        self.base_dir = base_dir;
        self.clear();
    }

    fn clear(&mut self) {
        self.active_files.clear();
        self.next_use = 0;
    }

    fn active_files_snapshot(&self) -> Vec<ActiveRecordingFile> {
        let mut active_files = self
            .active_files
            .iter()
            .map(|(room_id, active_file)| ActiveRecordingFile {
                room_id: *room_id,
                file_name: active_file.file_name.clone(),
            })
            .collect::<Vec<_>>();
        active_files.sort_by_key(|file| file.room_id);
        active_files
    }

    fn least_recently_used_room_id(&self) -> Option<u64> {
        self.active_files
            .iter()
            .min_by_key(|(room_id, active_file)| (active_file.last_used, **room_id))
            .map(|(room_id, _)| *room_id)
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

        let needs_open = match self.active_files.get_mut(&room_id) {
            Some(active_file) if active_file.key == key => false,
            Some(active_file) => {
                active_file.file.flush().await?;
                true
            }
            None => {
                if self.active_files.len() == MAX_ACTIVE_RECORDING_FILES {
                    let evicted_room_id = self
                        .least_recently_used_room_id()
                        .expect("active recording files are not empty");
                    self.active_files
                        .get_mut(&evicted_room_id)
                        .expect("least recently used recording file exists")
                        .file
                        .flush()
                        .await?;
                    self.active_files.remove(&evicted_room_id);
                }
                true
            }
        };

        if needs_open {
            fs::create_dir_all(&self.base_dir).await?;
            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.base_dir.join(&file_name))
                .await?;
            self.active_files.insert(
                room_id,
                ActiveRoomFile {
                    key,
                    file_name: file_name.clone(),
                    file,
                    last_used: 0,
                },
            );
        }

        let mut content = String::new();
        for message in messages {
            content.push_str(&format_message_line(message, at));
        }

        let active_file = self
            .active_files
            .get_mut(&room_id)
            .expect("recording file is open");
        active_file.file.write_all(content.as_bytes()).await?;
        active_file.file.flush().await?;
        self.next_use = self.next_use.wrapping_add(1);
        active_file.last_used = self.next_use;

        Ok(active_file.file_name.clone())
    }
}

#[cfg(test)]
mod tests {
    use std::io;
    use std::path::PathBuf;

    use chrono::{Local, TimeZone};
    use tempfile::tempdir;
    use tokio::sync::mpsc;

    use super::{
        format_message_line, preserve_event_batch, record_file_name, recording_error_message,
        sanitize_anchor_name, DanmakuRecorder, DanmakuRecordingState, DanmakuRecordingStatus,
        RecordBatch, RecordingWriter, WorkerBatchOutcome,
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

    async fn expect_written_batch(
        recorder: &DanmakuRecorder,
        batch: RecordBatch,
    ) -> Option<DanmakuRecordingStatus> {
        match recorder.process_batch(batch).await.expect("process batch") {
            WorkerBatchOutcome::Succeeded(status_change) => status_change,
            WorkerBatchOutcome::Discarded => panic!("expected batch write, got discard"),
            WorkerBatchOutcome::Failed { error, .. } => {
                panic!("expected batch write, got error: {error}")
            }
        }
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
    async fn alternates_rooms_without_replacing_the_other_file() {
        let temp = tempdir().expect("tempdir");
        let mut writer = RecordingWriter::new(temp.path().to_path_buf());
        let at = Local.with_ymd_and_hms(2026, 8, 27, 12, 0, 0).unwrap();

        writer
            .write_batch(6, Some("主播甲"), at, &[danmaku("甲", "第一条")])
            .await
            .expect("room 6");
        writer
            .write_batch(7, Some("主播乙"), at, &[danmaku("乙", "第二条")])
            .await
            .expect("room 7");
        writer
            .write_batch(6, Some("主播甲"), at, &[danmaku("甲", "第三条")])
            .await
            .expect("room 6 again");

        assert_eq!(writer.active_files.len(), 2);
        assert!(
            std::fs::read_to_string(temp.path().join("2026-08-27-6-主播甲.txt"))
                .expect("room 6 file")
                .contains("第三条")
        );
    }

    #[tokio::test]
    async fn evicts_the_least_recently_used_room_before_opening_a_sixth_file() {
        let temp = tempdir().expect("tempdir");
        let mut writer = RecordingWriter::new(temp.path().to_path_buf());
        let at = Local.with_ymd_and_hms(2026, 8, 27, 12, 0, 0).unwrap();

        for room_id in 1..=5 {
            writer
                .write_batch(room_id, Some("主播"), at, &[danmaku("用户", "首条")])
                .await
                .expect("write initial room");
        }
        writer
            .write_batch(2, Some("主播"), at, &[danmaku("用户", "再次写入")])
            .await
            .expect("refresh room 2");
        writer
            .write_batch(6, Some("主播"), at, &[danmaku("用户", "第六房")])
            .await
            .expect("write sixth room");

        assert_eq!(writer.active_files.len(), 5);
        assert!(!writer.active_files.contains_key(&1));
        assert!(writer.active_files.contains_key(&2));
        assert!(writer.active_files.contains_key(&6));
        assert!(
            std::fs::read_to_string(temp.path().join("2026-08-27-1-主播.txt"))
                .expect("evicted room file")
                .contains("首条")
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

    #[tokio::test]
    async fn disabled_recorder_rejects_batches_and_enabled_recorder_starts_waiting() {
        let (sender, mut receiver) = mpsc::channel(1);
        let disabled = DanmakuRecorder::with_sender(false, sender.clone(), PathBuf::new()).await;
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

        let enabled = DanmakuRecorder::with_sender(true, sender, PathBuf::new()).await;
        assert_eq!(
            enabled.snapshot().expect("enabled snapshot").state,
            DanmakuRecordingState::Waiting
        );
    }

    #[tokio::test]
    async fn full_channel_enters_error_and_retry_restores_waiting() {
        let (sender, _receiver) = mpsc::channel(1);
        let recorder = DanmakuRecorder::with_sender(true, sender, PathBuf::new()).await;
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

        let retried = recorder.retry().await.expect("retry");
        assert_eq!(retried.state, DanmakuRecordingState::Waiting);
        assert_eq!(retried.error_message, None);
    }

    #[tokio::test]
    async fn deduplicated_super_chat_is_enqueued_once_for_recording() {
        let room_id = 22625025;
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();
        let (sender, mut receiver) = mpsc::channel(1);
        let recorder = DanmakuRecorder::with_sender(true, sender, PathBuf::new()).await;
        let mut dedup = SuperChatDedupWindow::default();
        let batch = dedup.retain_new(
            room_id,
            vec![
                sourced_super_chat("10", "SUPER_CHAT_MESSAGE"),
                sourced_super_chat("10", "SUPER_CHAT_MESSAGE_JPN"),
            ],
        );

        let recording_batch = batch.clone();
        let event_batch = preserve_event_batch(batch, |_messages| {
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

    #[tokio::test]
    async fn recorder_rejection_preserves_the_original_event_batch() {
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();
        let original = danmaku("张三", "仍需发送");

        let (disabled_sender, _disabled_receiver) = mpsc::channel(1);
        let disabled = DanmakuRecorder::with_sender(false, disabled_sender, PathBuf::new()).await;
        let disabled_batch = vec![original.clone()];
        let disabled_event = preserve_event_batch(disabled_batch.clone(), |_messages| {
            disabled.try_record_batch(6, Some("测试主播"), at, disabled_batch)
        });
        assert_eq!(disabled_event.len(), 1);
        assert_eq!(disabled_event[0].text, original.text);

        let (full_sender, _full_receiver) = mpsc::channel(1);
        let full = DanmakuRecorder::with_sender(true, full_sender, PathBuf::new()).await;
        assert!(full.try_record_batch(6, Some("测试主播"), at, vec![danmaku("李四", "占满队列")]));
        let full_batch = vec![original.clone()];
        let full_event = preserve_event_batch(full_batch.clone(), |_messages| {
            full.try_record_batch(6, Some("测试主播"), at, full_batch)
        });
        assert_eq!(full_event.len(), 1);
        assert_eq!(full_event[0].text, original.text);
        assert_eq!(
            full.snapshot().expect("full recorder status").state,
            DanmakuRecordingState::Error
        );

        let error_batch = vec![original.clone()];
        let error_event = preserve_event_batch(error_batch.clone(), |_messages| {
            full.try_record_batch(6, Some("测试主播"), at, error_batch)
        });
        assert_eq!(error_event.len(), 1);
        assert_eq!(error_event[0].text, original.text);
    }

    #[tokio::test]
    async fn enqueue_remains_non_blocking_while_writer_lock_is_held() {
        let temp = tempdir().expect("temp dir");
        let (sender, mut receiver) = mpsc::channel(1);
        let recorder = DanmakuRecorder::with_sender(true, sender, temp.path().to_path_buf()).await;
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        let _writer_guard = recorder.writer.lock().await;
        let batch = vec![danmaku("张三", "立即入队")];
        let event_batch = preserve_event_batch(batch.clone(), |recording_batch| {
            recorder.try_record_batch(6, Some("示例主播"), at, recording_batch)
        });

        assert_eq!(event_batch.len(), 1);
        assert_eq!(event_batch[0].text, "立即入队");
        let queued = receiver.try_recv().expect("queued while writer lock held");
        assert_eq!(queued.room_id, 6);
        assert_eq!(queued.anchor_name.as_deref(), Some("示例主播"));
        assert_eq!(queued.messages[0].text, "立即入队");
    }

    #[tokio::test]
    async fn queue_full_error_retains_cached_active_files_without_writer_lock() {
        let temp = tempdir().expect("temp dir");
        let (sender, mut receiver) = mpsc::channel(1);
        let recorder = DanmakuRecorder::with_sender(true, sender, temp.path().to_path_buf()).await;
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        assert!(recorder.try_record_batch(6, Some("主播甲"), at, vec![danmaku("甲", "首条")]));
        let first_batch = receiver.try_recv().expect("first batch");
        let _ = expect_written_batch(&recorder, first_batch).await;

        let cached = recorder.snapshot().expect("cached snapshot");
        assert_eq!(
            cached.active_files,
            vec![super::ActiveRecordingFile {
                room_id: 6,
                file_name: "2026-08-23-6-主播甲.txt".to_string(),
            }]
        );

        let _writer_guard = recorder.writer.lock().await;
        assert!(recorder.try_record_batch(6, Some("主播甲"), at, vec![danmaku("甲", "占满队列")]));
        assert!(!recorder.try_record_batch(6, Some("主播甲"), at, vec![danmaku("甲", "触发错误")]));

        let failed = recorder.snapshot().expect("failed snapshot");
        assert_eq!(failed.state, DanmakuRecordingState::Error);
        assert_eq!(failed.active_files, cached.active_files);
        assert_eq!(
            failed.error_message.as_deref(),
            Some("记录队列已满，记录已暂停")
        );
    }

    #[tokio::test]
    async fn status_keeps_sorted_active_files_through_error_and_clears_them_on_retry() {
        let temp = tempdir().expect("temp dir");
        let (sender, mut receiver) = mpsc::channel(4);
        let recorder = DanmakuRecorder::with_sender(true, sender, temp.path().to_path_buf()).await;
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        assert!(recorder.try_record_batch(7, Some("主播乙"), at, vec![danmaku("乙", "第二条")]));
        assert!(recorder.try_record_batch(6, Some("主播甲"), at, vec![danmaku("甲", "第一条")]));

        let room_7 = receiver.try_recv().expect("room 7 batch");
        let room_6 = receiver.try_recv().expect("room 6 batch");
        let _ = expect_written_batch(&recorder, room_7).await;
        let _ = expect_written_batch(&recorder, room_6).await;

        let status = recorder.snapshot().expect("snapshot");
        assert_eq!(
            status.active_files,
            vec![
                super::ActiveRecordingFile {
                    room_id: 6,
                    file_name: "2026-08-23-6-主播甲.txt".to_string(),
                },
                super::ActiveRecordingFile {
                    room_id: 7,
                    file_name: "2026-08-23-7-主播乙.txt".to_string(),
                },
            ]
        );

        recorder
            .record_error_for_test("记录文件写入失败，记录已暂停".to_string())
            .await
            .expect("record error");
        let failed = recorder.snapshot().expect("error snapshot");
        assert_eq!(failed.state, DanmakuRecordingState::Error);
        assert_eq!(failed.active_files, status.active_files);
        assert_eq!(recorder.writer_active_file_count().await, 2);

        let retried = recorder.retry().await.expect("retry");
        assert_eq!(retried.state, DanmakuRecordingState::Waiting);
        assert!(retried.active_files.is_empty());
        assert_eq!(recorder.writer_active_file_count().await, 0);

        let rendered = serde_json::to_string(&failed).expect("serialize status");

        for forbidden in [
            "baseDir",
            "/Users/example",
            "张三",
            "弹幕正文",
            "currentRoomFanMedal",
            "粉丝牌",
            "senderUid",
            "cookie",
            "token",
        ] {
            assert!(!rendered.contains(forbidden), "leaked {forbidden}");
        }
    }

    #[tokio::test]
    async fn status_evicts_the_least_recently_used_room_before_exposing_a_sixth_file() {
        let temp = tempdir().expect("temp dir");
        let (sender, mut receiver) = mpsc::channel(8);
        let recorder = DanmakuRecorder::with_sender(true, sender, temp.path().to_path_buf()).await;
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        for room_id in 1..=5 {
            assert!(recorder.try_record_batch(
                room_id,
                Some("主播"),
                at,
                vec![danmaku("用户", "首条")]
            ));
            let batch = receiver.try_recv().expect("initial room batch");
            let _ = expect_written_batch(&recorder, batch).await;
        }
        assert!(recorder.try_record_batch(2, Some("主播"), at, vec![danmaku("用户", "再次写入")]));
        let refreshed = receiver.try_recv().expect("refreshed room batch");
        let _ = expect_written_batch(&recorder, refreshed).await;
        assert!(recorder.try_record_batch(6, Some("主播"), at, vec![danmaku("用户", "第六房")]));
        let sixth = receiver.try_recv().expect("sixth room batch");
        let _ = expect_written_batch(&recorder, sixth).await;

        let status = recorder.snapshot().expect("snapshot");
        assert_eq!(
            status.active_files,
            vec![
                super::ActiveRecordingFile {
                    room_id: 2,
                    file_name: "2026-08-23-2-主播.txt".to_string(),
                },
                super::ActiveRecordingFile {
                    room_id: 3,
                    file_name: "2026-08-23-3-主播.txt".to_string(),
                },
                super::ActiveRecordingFile {
                    room_id: 4,
                    file_name: "2026-08-23-4-主播.txt".to_string(),
                },
                super::ActiveRecordingFile {
                    room_id: 5,
                    file_name: "2026-08-23-5-主播.txt".to_string(),
                },
                super::ActiveRecordingFile {
                    room_id: 6,
                    file_name: "2026-08-23-6-主播.txt".to_string(),
                },
            ]
        );
    }

    #[tokio::test]
    async fn queued_batches_from_stale_epochs_are_discarded_after_error_and_retry() {
        let temp = tempdir().expect("temp dir");
        let (sender, mut receiver) = mpsc::channel(4);
        let recorder = DanmakuRecorder::with_sender(true, sender, temp.path().to_path_buf()).await;
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        assert!(recorder.try_record_batch(
            6,
            Some("示例主播"),
            at,
            vec![danmaku("张三", "第一批")]
        ));
        assert!(recorder.try_record_batch(
            6,
            Some("示例主播"),
            at,
            vec![danmaku("李四", "第二批")]
        ));
        assert!(recorder.try_record_batch(
            6,
            Some("示例主播"),
            at,
            vec![danmaku("王五", "第三批")]
        ));

        let first = receiver.try_recv().expect("first batch");
        let second = receiver.try_recv().expect("second batch");
        let third = receiver.try_recv().expect("third batch");

        let _ = expect_written_batch(&recorder, first).await;
        recorder
            .record_error_for_test("记录文件写入失败，记录已暂停".to_string())
            .await
            .expect("force error");
        assert_eq!(
            recorder.snapshot().expect("failed snapshot").state,
            DanmakuRecordingState::Error
        );

        match recorder
            .process_batch(second)
            .await
            .expect("discard stale second")
        {
            WorkerBatchOutcome::Discarded => {}
            WorkerBatchOutcome::Succeeded(_) => panic!("stale second batch wrote after error"),
            WorkerBatchOutcome::Failed { error, .. } => {
                panic!("stale second batch errored unexpectedly: {error}")
            }
        }

        let retried = recorder.retry().await.expect("retry");
        assert_eq!(retried.state, DanmakuRecordingState::Waiting);
        assert!(retried.active_files.is_empty());

        match recorder
            .process_batch(third)
            .await
            .expect("discard stale third")
        {
            WorkerBatchOutcome::Discarded => {}
            WorkerBatchOutcome::Succeeded(_) => panic!("stale third batch wrote after retry"),
            WorkerBatchOutcome::Failed { error, .. } => {
                panic!("stale third batch errored unexpectedly: {error}")
            }
        }

        assert!(recorder.try_record_batch(
            6,
            Some("示例主播"),
            at,
            vec![danmaku("赵六", "第四批")]
        ));
        let fourth = receiver.try_recv().expect("fourth batch");
        let _ = expect_written_batch(&recorder, fourth).await;

        assert_eq!(
            tokio::fs::read_to_string(temp.path().join("2026-08-23-6-示例主播.txt"))
                .await
                .expect("read record"),
            "[20:15:03] 张三：第一批\n[20:15:03] 赵六：第四批\n"
        );
    }

    #[tokio::test]
    async fn disabling_recording_clears_writer_handles_and_public_status_together() {
        let temp = tempdir().expect("temp dir");
        let (sender, mut receiver) = mpsc::channel(2);
        let recorder = DanmakuRecorder::with_sender(true, sender, temp.path().to_path_buf()).await;
        let at = Local.with_ymd_and_hms(2026, 8, 23, 20, 15, 3).unwrap();

        assert!(recorder.try_record_batch(6, Some("示例主播"), at, vec![danmaku("张三", "首条")]));
        let batch = receiver.try_recv().expect("record batch");
        let _ = expect_written_batch(&recorder, batch).await;
        assert_eq!(recorder.writer_active_file_count().await, 1);

        let status_change = recorder
            .set_enabled_change(false)
            .await
            .expect("disable recording")
            .expect("status change");
        assert_eq!(status_change.state, DanmakuRecordingState::Disabled);
        assert!(status_change.active_files.is_empty());
        assert_eq!(recorder.writer_active_file_count().await, 0);
        assert!(recorder
            .snapshot()
            .expect("disabled snapshot")
            .active_files
            .is_empty());
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
