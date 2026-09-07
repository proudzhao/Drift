use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tokio::sync::Notify;

pub const MAX_ACTIVE_ROOM_SESSIONS: usize = 5;
pub const ROOM_SESSIONS_EVENT: &str = "bilibili-room-sessions";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RoomSessionStatus {
    Connecting,
    Connected,
    Reconnecting,
    NotLive,
    InvalidRoom,
    Error,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RoomSessionSnapshot {
    pub session_id: String,
    pub requested_room_id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub room_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fan_medal_name: Option<String>,
    pub status: RoomSessionStatus,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub live_status: Option<u8>,
}

#[derive(Debug, Clone)]
pub struct SessionLease {
    pub session_id: String,
    pub generation: u64,
    task_completion: Arc<TaskCompletion>,
}

impl SessionLease {
    pub(crate) fn completion_guard(&self) -> TaskCompletionGuard {
        TaskCompletionGuard {
            completion: Arc::clone(&self.task_completion),
        }
    }
}

#[derive(Debug, Default)]
struct TaskCompletion {
    completed: AtomicBool,
    notify: Notify,
}

impl TaskCompletion {
    fn complete(&self) {
        self.completed.store(true, Ordering::Release);
        self.notify.notify_one();
    }

    fn is_complete(&self) -> bool {
        self.completed.load(Ordering::Acquire)
    }

    async fn wait(&self) {
        while !self.completed.load(Ordering::Acquire) {
            let notified = self.notify.notified();
            if self.completed.load(Ordering::Acquire) {
                break;
            }
            notified.await;
        }
    }
}

pub(crate) struct TaskCompletionGuard {
    completion: Arc<TaskCompletion>,
}

impl Drop for TaskCompletionGuard {
    fn drop(&mut self) {
        self.completion.complete();
    }
}

pub(crate) enum TakenSessionTask {
    Installed(JoinHandle<()>),
    Pending(PendingTaskTermination),
}

pub(crate) struct PendingTaskTermination(Arc<TaskCompletion>);

impl TakenSessionTask {
    pub(crate) fn abort(&self) {
        if let Self::Installed(task) = self {
            task.abort();
        }
    }

    pub(crate) async fn wait(self) {
        match self {
            Self::Installed(task) => {
                let _ = task.await;
            }
            Self::Pending(completion) => completion.0.wait().await,
        }
    }
}

struct RoomSessionEntry {
    session_id: String,
    requested_room_id: u64,
    room_id: Option<u64>,
    anchor_uid: Option<u64>,
    anchor_name: Option<String>,
    fan_medal_name: Option<String>,
    status: RoomSessionStatus,
    message: String,
    live_status: Option<u8>,
    generation: u64,
    created_order: u64,
    task_install_open: bool,
    task_completion: Arc<TaskCompletion>,
    task: Option<JoinHandle<()>>,
}

impl RoomSessionEntry {
    fn snapshot(&self) -> RoomSessionSnapshot {
        RoomSessionSnapshot {
            session_id: self.session_id.clone(),
            requested_room_id: self.requested_room_id,
            room_id: self.room_id,
            anchor_name: self.anchor_name.clone(),
            fan_medal_name: self.fan_medal_name.clone(),
            status: self.status,
            message: self.message.clone(),
            live_status: self.live_status,
        }
    }
}

#[derive(Default)]
struct RoomConnectionState {
    next_session_id: u64,
    sessions: HashMap<String, RoomSessionEntry>,
    canonical_rooms: HashMap<u64, String>,
    disconnect_all_in_progress: bool,
}

#[derive(Default)]
pub struct RoomConnectionManager {
    inner: Mutex<RoomConnectionState>,
    publication_gate: Mutex<()>,
}

impl RoomConnectionManager {
    pub fn reserve(&self, requested_room_id: u64) -> Result<SessionLease, String> {
        let mut inner = self.lock()?;
        if inner.disconnect_all_in_progress {
            return Err("正在断开全部直播间".to_string());
        }
        let active_sessions = inner
            .sessions
            .values()
            .filter(|entry| is_network_session_active(entry.status))
            .count();
        if active_sessions >= MAX_ACTIVE_ROOM_SESSIONS {
            return Err("最多同时连接 5 个直播间".to_string());
        }

        inner.next_session_id += 1;
        let generation = inner.next_session_id;
        let session_id = format!("room-session-{generation}");
        let task_completion = Arc::new(TaskCompletion::default());
        inner.sessions.insert(
            session_id.clone(),
            RoomSessionEntry {
                session_id: session_id.clone(),
                requested_room_id,
                room_id: None,
                anchor_uid: None,
                anchor_name: None,
                fan_medal_name: None,
                status: RoomSessionStatus::Connecting,
                message: "正在连接".to_string(),
                live_status: None,
                generation,
                created_order: generation,
                task_install_open: true,
                task_completion: Arc::clone(&task_completion),
                task: None,
            },
        );

        Ok(SessionLease {
            session_id,
            generation,
            task_completion,
        })
    }

    pub fn install_task(&self, lease: &SessionLease, task: JoinHandle<()>) -> Result<(), String> {
        let mut task = Some(task);
        let result = match self.lock() {
            Ok(mut inner) => match current_entry_mut(&mut inner, lease) {
                Ok(entry) if entry.task_install_open && entry.task.is_none() => {
                    entry.task = task.take();
                    Ok(())
                }
                Ok(entry) if !entry.task_install_open => Err("会话正在断开".to_string()),
                Ok(_) => Err("会话任务已经安装".to_string()),
                Err(error) => Err(error),
            },
            Err(error) => Err(error),
        };
        if let Err(error) = result {
            if let Some(task) = task {
                task.abort();
            }
            return Err(error);
        }
        Ok(())
    }

    pub(crate) fn take_task(&self, session_id: &str) -> Result<Option<TakenSessionTask>, String> {
        let mut inner = self.lock()?;
        if inner.disconnect_all_in_progress {
            return Err("正在断开全部直播间".to_string());
        }
        let Some(entry) = inner.sessions.get_mut(session_id) else {
            return Ok(None);
        };
        if !entry.task_install_open {
            return Err("会话正在断开".to_string());
        }
        entry.task_install_open = false;
        Ok(Some(match entry.task.take() {
            Some(task) => TakenSessionTask::Installed(task),
            None => TakenSessionTask::Pending(PendingTaskTermination(Arc::clone(
                &entry.task_completion,
            ))),
        }))
    }

    pub(crate) fn take_all_tasks(&self) -> Result<Vec<TakenSessionTask>, String> {
        let mut inner = self.lock()?;
        if inner
            .sessions
            .values()
            .any(|entry| !entry.task_install_open)
        {
            return Err("已有会话正在断开".to_string());
        }
        inner.disconnect_all_in_progress = true;
        Ok(inner
            .sessions
            .values_mut()
            .map(|entry| {
                entry.task_install_open = false;
                match entry.task.take() {
                    Some(task) => TakenSessionTask::Installed(task),
                    None => TakenSessionTask::Pending(PendingTaskTermination(Arc::clone(
                        &entry.task_completion,
                    ))),
                }
            })
            .collect())
    }

    pub(crate) fn resolved_room_leases(&self) -> Result<Vec<(u64, SessionLease)>, String> {
        let inner = self.lock()?;
        Ok(inner
            .sessions
            .values()
            .filter_map(|entry| {
                entry.room_id.map(|room_id| {
                    (
                        room_id,
                        SessionLease {
                            session_id: entry.session_id.clone(),
                            generation: entry.generation,
                            task_completion: Arc::clone(&entry.task_completion),
                        },
                    )
                })
            })
            .collect())
    }

    pub(crate) fn resolved_room_lease(
        &self,
        session_id: &str,
        room_id: u64,
    ) -> Result<Option<SessionLease>, String> {
        let inner = self.lock()?;
        Ok(inner
            .sessions
            .get(session_id)
            .filter(|entry| entry.room_id == Some(room_id))
            .map(|entry| SessionLease {
                session_id: entry.session_id.clone(),
                generation: entry.generation,
                task_completion: Arc::clone(&entry.task_completion),
            }))
    }

    pub(crate) fn invalidate_taken(&self, session_id: &str) -> Result<bool, String> {
        let mut inner = self.lock()?;
        let Some(entry) = inner.sessions.get(session_id) else {
            return Ok(false);
        };
        if entry.task_install_open || entry.task.is_some() || !entry.task_completion.is_complete() {
            return Err("会话任务尚未终止".to_string());
        }
        let entry = inner.sessions.remove(session_id).expect("entry exists");
        entry.task_completion.complete();
        if let Some(room_id) = entry.room_id {
            if inner.canonical_rooms.get(&room_id).map(String::as_str) == Some(session_id) {
                inner.canonical_rooms.remove(&room_id);
            }
        }
        Ok(true)
    }

    pub(crate) fn invalidate_all_taken(&self) -> Result<(), String> {
        let mut inner = self.lock()?;
        if !inner.disconnect_all_in_progress {
            return Err("未开始断开全部直播间".to_string());
        }
        if inner.sessions.values().any(|entry| {
            entry.task_install_open || entry.task.is_some() || !entry.task_completion.is_complete()
        }) {
            return Err("仍有会话任务未终止".to_string());
        }
        for (_, entry) in inner.sessions.drain() {
            entry.task_completion.complete();
        }
        inner.canonical_rooms.clear();
        inner.disconnect_all_in_progress = false;
        Ok(())
    }

    pub fn resolve_room(
        &self,
        lease: &SessionLease,
        room_id: u64,
        anchor_uid: u64,
    ) -> Result<bool, String> {
        let mut inner = self.lock()?;
        let entry = current_entry(&inner, lease)?;
        if let Some(existing_room_id) = entry.room_id {
            if existing_room_id != room_id {
                return Err("直播间解析结果已变化".to_string());
            }
            let entry = current_entry_mut(&mut inner, lease)?;
            if entry.anchor_uid != Some(anchor_uid) {
                entry.anchor_uid = Some(anchor_uid);
            }
            return Ok(false);
        }

        if inner
            .canonical_rooms
            .get(&room_id)
            .is_some_and(|session_id| session_id != &lease.session_id)
        {
            return Err("该直播间已经连接".to_string());
        }

        let entry = current_entry_mut(&mut inner, lease)?;
        entry.room_id = Some(room_id);
        entry.anchor_uid = Some(anchor_uid);
        inner
            .canonical_rooms
            .insert(room_id, lease.session_id.clone());
        Ok(true)
    }

    pub fn set_metadata(
        &self,
        lease: &SessionLease,
        anchor_name: Option<String>,
        fan_medal_name: Option<String>,
    ) -> Result<(), String> {
        let mut inner = self.lock()?;
        let entry = current_entry_mut(&mut inner, lease)?;
        entry.anchor_name = anchor_name;
        entry.fan_medal_name = fan_medal_name;
        Ok(())
    }

    pub fn update_status(
        &self,
        lease: &SessionLease,
        status: RoomSessionStatus,
        message: impl Into<String>,
        live_status: Option<u8>,
    ) -> Result<(), String> {
        let mut inner = self.lock()?;
        let entry = current_entry_mut(&mut inner, lease)?;
        if is_terminal_session(entry.status) && is_network_session_active(status) {
            return Err("终态会话必须先断开再重试".to_string());
        }
        entry.status = status;
        entry.message = message.into();
        entry.live_status = live_status;
        Ok(())
    }

    pub fn invalidate(&self, session_id: &str) -> Result<Option<JoinHandle<()>>, String> {
        let mut inner = self.lock()?;
        let Some(mut entry) = inner.sessions.remove(session_id) else {
            return Ok(None);
        };
        entry.task_completion.complete();
        if let Some(room_id) = entry.room_id {
            if inner.canonical_rooms.get(&room_id).map(String::as_str) == Some(session_id) {
                inner.canonical_rooms.remove(&room_id);
            }
        }
        Ok(entry.task.take())
    }

    #[cfg(test)]
    pub fn invalidate_all(&self) -> Result<Vec<JoinHandle<()>>, String> {
        let mut inner = self.lock()?;
        let tasks = inner
            .sessions
            .drain()
            .filter_map(|(_, mut entry)| {
                entry.task_completion.complete();
                entry.task.take()
            })
            .collect();
        inner.canonical_rooms.clear();
        inner.disconnect_all_in_progress = false;
        Ok(tasks)
    }

    pub fn snapshot(&self) -> Result<Vec<RoomSessionSnapshot>, String> {
        let inner = self.lock()?;
        let mut entries: Vec<_> = inner.sessions.values().collect();
        entries.sort_by_key(|entry| entry.created_order);
        Ok(entries
            .into_iter()
            .map(RoomSessionEntry::snapshot)
            .collect())
    }

    pub(crate) fn publish_snapshot_with(
        &self,
        publish: impl FnOnce(Vec<RoomSessionSnapshot>) -> Result<(), String>,
    ) -> Result<(), String> {
        let _publication_guard = self
            .publication_gate
            .lock()
            .map_err(|_| "房间会话发布状态不可用".to_string())?;
        publish(self.snapshot()?)
    }

    pub fn is_current(&self, lease: &SessionLease) -> bool {
        self.lock().ok().and_then(|inner| {
            inner
                .sessions
                .get(&lease.session_id)
                .map(|entry| entry.generation)
        }) == Some(lease.generation)
    }

    pub fn active_source_count(&self) -> Result<usize, String> {
        let inner = self.lock()?;
        Ok(inner
            .sessions
            .values()
            .filter(|entry| is_source_active(entry.status))
            .count())
    }

    pub fn connected_room(&self, room_id: u64) -> Result<RoomSessionSnapshot, String> {
        let inner = self.lock()?;
        let entry = inner
            .canonical_rooms
            .get(&room_id)
            .and_then(|session_id| inner.sessions.get(session_id))
            .filter(|entry| entry.status == RoomSessionStatus::Connected)
            .ok_or_else(|| "直播间未连接".to_string())?;
        Ok(entry.snapshot())
    }

    fn lock(&self) -> Result<MutexGuard<'_, RoomConnectionState>, String> {
        self.inner
            .lock()
            .map_err(|_| "房间会话状态不可用".to_string())
    }
}

fn current_entry<'a>(
    inner: &'a RoomConnectionState,
    lease: &SessionLease,
) -> Result<&'a RoomSessionEntry, String> {
    inner
        .sessions
        .get(&lease.session_id)
        .filter(|entry| entry.generation == lease.generation)
        .ok_or_else(|| "会话已失效".to_string())
}

fn current_entry_mut<'a>(
    inner: &'a mut RoomConnectionState,
    lease: &SessionLease,
) -> Result<&'a mut RoomSessionEntry, String> {
    inner
        .sessions
        .get_mut(&lease.session_id)
        .filter(|entry| entry.generation == lease.generation)
        .ok_or_else(|| "会话已失效".to_string())
}

fn is_network_session_active(status: RoomSessionStatus) -> bool {
    matches!(
        status,
        RoomSessionStatus::Connecting
            | RoomSessionStatus::Connected
            | RoomSessionStatus::Reconnecting
    )
}

fn is_source_active(status: RoomSessionStatus) -> bool {
    matches!(
        status,
        RoomSessionStatus::Connected | RoomSessionStatus::Reconnecting
    )
}

fn is_terminal_session(status: RoomSessionStatus) -> bool {
    matches!(
        status,
        RoomSessionStatus::NotLive | RoomSessionStatus::InvalidRoom | RoomSessionStatus::Error
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    use std::thread;
    use tokio::sync::oneshot;

    struct CancellationSignal(Option<oneshot::Sender<()>>);

    impl Drop for CancellationSignal {
        fn drop(&mut self) {
            if let Some(sender) = self.0.take() {
                let _ = sender.send(());
            }
        }
    }

    fn pending_task_with_cancellation_signal() -> (JoinHandle<()>, oneshot::Receiver<()>) {
        let (sender, receiver) = oneshot::channel();
        let signal = CancellationSignal(Some(sender));
        let task = tauri::async_runtime::spawn(async move {
            let _signal = signal;
            std::future::pending().await
        });
        (task, receiver)
    }

    fn guarded_pending_task_with_cancellation_signal(
        lease: &SessionLease,
    ) -> (JoinHandle<()>, oneshot::Receiver<()>) {
        let (sender, receiver) = oneshot::channel();
        let signal = CancellationSignal(Some(sender));
        let completion = lease.completion_guard();
        let task = tauri::async_runtime::spawn(async move {
            let _completion = completion;
            let _signal = signal;
            std::future::pending().await
        });
        (task, receiver)
    }

    fn resolved_session(
        manager: &RoomConnectionManager,
        requested_room_id: u64,
        room_id: u64,
    ) -> SessionLease {
        let lease = manager.reserve(requested_room_id).expect("reserve");
        manager
            .resolve_room(&lease, room_id, room_id + 1_000)
            .expect("resolve");
        lease
    }

    #[test]
    fn reserves_at_most_five_active_sessions() {
        let manager = RoomConnectionManager::default();
        for room_id in 1..=5 {
            manager.reserve(room_id).expect("reserve");
        }
        let error = manager.reserve(6).expect_err("sixth session must fail");
        assert_eq!(error, "最多同时连接 5 个直播间");
        assert_eq!(manager.snapshot().expect("snapshot").len(), 5);
    }

    #[test]
    fn canonical_room_resolution_rejects_short_and_real_duplicates() {
        let manager = RoomConnectionManager::default();
        let first = manager.reserve(76).expect("short room");
        assert!(manager
            .resolve_room(&first, 14073662, 50333369)
            .expect("resolve first"));
        assert!(!manager
            .resolve_room(&first, 14073662, 50333369)
            .expect("resolve reconnect"));
        let second = manager.reserve(14073662).expect("real reservation");
        assert_eq!(
            manager
                .resolve_room(&second, 14073662, 50333369)
                .expect_err("duplicate"),
            "该直播间已经连接"
        );
    }

    #[test]
    fn stale_generation_cannot_update_or_emit() {
        let manager = RoomConnectionManager::default();
        let lease = manager.reserve(6).expect("reserve");
        manager.invalidate(&lease.session_id).expect("invalidate");
        assert!(!manager.is_current(&lease));
        assert!(manager
            .update_status(&lease, RoomSessionStatus::Connected, "late", None)
            .is_err());
    }

    #[test]
    fn invalidation_removes_session_and_canonical_binding() {
        let manager = RoomConnectionManager::default();
        let first = manager.reserve(76).expect("reserve first");
        manager
            .resolve_room(&first, 14073662, 50333369)
            .expect("resolve first");

        assert!(manager
            .invalidate(&first.session_id)
            .expect("invalidate")
            .is_none());
        assert!(manager.snapshot().expect("snapshot").is_empty());

        let retry = manager.reserve(14073662).expect("reserve retry");
        assert!(manager
            .resolve_room(&retry, 14073662, 50333369)
            .expect("resolve retry"));
    }

    #[test]
    fn snapshots_and_active_sources_follow_status_contracts() {
        let manager = RoomConnectionManager::default();
        let first = manager.reserve(3).expect("reserve first");
        let second = manager.reserve(1).expect("reserve second");
        let third = manager.reserve(2).expect("reserve third");
        manager.resolve_room(&first, 103, 1003).expect("resolve");
        manager
            .set_metadata(&first, Some("主播".into()), Some("粉丝牌".into()))
            .expect("metadata");
        manager
            .update_status(&first, RoomSessionStatus::Connected, "已连接", Some(1))
            .expect("connected");
        manager
            .update_status(
                &second,
                RoomSessionStatus::Reconnecting,
                "正在重连",
                Some(1),
            )
            .expect("reconnecting");
        manager
            .update_status(&third, RoomSessionStatus::NotLive, "未开播", Some(0))
            .expect("terminal");

        assert_eq!(manager.active_source_count().expect("count"), 2);
        assert_eq!(
            manager
                .snapshot()
                .expect("snapshot")
                .into_iter()
                .map(|snapshot| snapshot.requested_room_id)
                .collect::<Vec<_>>(),
            vec![3, 1, 2]
        );
        assert_eq!(
            manager.connected_room(103).expect("connected").anchor_name,
            Some("主播".into())
        );
    }

    #[test]
    fn snapshot_json_omits_absent_optional_fields() {
        let snapshot = RoomSessionSnapshot {
            session_id: "room-session-1".into(),
            requested_room_id: 6,
            room_id: None,
            anchor_name: None,
            fan_medal_name: None,
            status: RoomSessionStatus::Connecting,
            message: "正在连接".into(),
            live_status: None,
        };

        assert_eq!(
            serde_json::to_value(snapshot).expect("serialize snapshot"),
            serde_json::json!({
                "sessionId": "room-session-1",
                "requestedRoomId": 6,
                "status": "connecting",
                "message": "正在连接"
            })
        );
    }

    #[test]
    fn serializes_snapshot_capture_and_publication_across_concurrent_callers() {
        let manager = Arc::new(RoomConnectionManager::default());
        manager.reserve(6).expect("first reservation");
        let (event_sender, event_receiver) = mpsc::channel();
        let (first_entered_sender, first_entered_receiver) = mpsc::channel();
        let (release_first_sender, release_first_receiver) = mpsc::channel();

        let first_manager = Arc::clone(&manager);
        let first_events = event_sender.clone();
        let first = thread::spawn(move || {
            first_manager.publish_snapshot_with(|snapshots| {
                first_entered_sender.send(()).expect("first entered");
                if first_manager.publication_gate.try_lock().is_ok() {
                    return Err("publication gate was not held".to_string());
                }
                first_events.send(snapshots).expect("first event");
                release_first_receiver.recv().expect("release first");
                Ok(())
            })
        });

        first_entered_receiver
            .recv()
            .expect("first publisher entered");
        manager.reserve(7).expect("second reservation");
        let (second_started_sender, second_started_receiver) = mpsc::channel();
        let second_manager = Arc::clone(&manager);
        let second = thread::spawn(move || {
            second_started_sender.send(()).expect("second started");
            second_manager.publish_snapshot_with(|snapshots| {
                event_sender.send(snapshots).expect("second event");
                Ok(())
            })
        });

        second_started_receiver
            .recv()
            .expect("second publisher started");
        let _ = release_first_sender.send(());
        first
            .join()
            .expect("first publisher thread")
            .expect("first publication");
        second
            .join()
            .expect("second publisher thread")
            .expect("second publication");

        let events: Vec<Vec<u64>> = event_receiver
            .try_iter()
            .map(|snapshots| {
                snapshots
                    .into_iter()
                    .map(|snapshot| snapshot.requested_room_id)
                    .collect()
            })
            .collect();
        assert_eq!(events, vec![vec![6], vec![6, 7]]);
    }

    #[test]
    fn one_terminal_room_does_not_change_other_connected_room() {
        let manager = RoomConnectionManager::default();
        let left = resolved_session(&manager, 1, 101);
        let right = resolved_session(&manager, 2, 202);
        manager
            .update_status(&left, RoomSessionStatus::NotLive, "未开播", Some(0))
            .expect("left terminal");
        manager
            .update_status(&right, RoomSessionStatus::Connected, "已连接", Some(1))
            .expect("right connected");
        assert_eq!(manager.active_source_count().expect("count"), 1);
        assert_eq!(
            manager.connected_room(202).expect("right").status,
            RoomSessionStatus::Connected
        );
    }

    #[test]
    fn terminal_session_cannot_bypass_reused_active_capacity() {
        for terminal_status in [
            RoomSessionStatus::NotLive,
            RoomSessionStatus::InvalidRoom,
            RoomSessionStatus::Error,
        ] {
            let manager = RoomConnectionManager::default();
            let leases: Vec<_> = (1..=5)
                .map(|room_id| manager.reserve(room_id).expect("reserve"))
                .collect();
            manager
                .update_status(&leases[0], terminal_status, "terminal", Some(0))
                .expect("terminal");
            manager.reserve(6).expect("reuse capacity");

            for active_status in [
                RoomSessionStatus::Connecting,
                RoomSessionStatus::Connected,
                RoomSessionStatus::Reconnecting,
            ] {
                assert!(manager
                    .update_status(&leases[0], active_status, "late reconnect", Some(1))
                    .is_err());
            }
            let snapshots = manager.snapshot().expect("snapshot");
            assert_eq!(
                snapshots
                    .iter()
                    .filter(|snapshot| is_network_session_active(snapshot.status))
                    .count(),
                MAX_ACTIVE_ROOM_SESSIONS
            );
            assert_eq!(snapshots[0].status, terminal_status);
        }
    }

    #[tokio::test]
    async fn rejected_task_installations_cancel_supplied_handles() {
        let manager = RoomConnectionManager::default();
        let stale = manager.reserve(1).expect("reserve stale");
        manager.invalidate(&stale.session_id).expect("invalidate");
        let (stale_task, stale_cancelled) = pending_task_with_cancellation_signal();
        assert!(manager.install_task(&stale, stale_task).is_err());
        tokio::time::timeout(std::time::Duration::from_secs(1), stale_cancelled)
            .await
            .expect("stale task cancellation timeout")
            .expect("stale task cancellation signal");

        let current = manager.reserve(2).expect("reserve current");
        let installed_task = tauri::async_runtime::spawn(std::future::pending());
        manager
            .install_task(&current, installed_task)
            .expect("install first task");
        let (duplicate_task, duplicate_cancelled) = pending_task_with_cancellation_signal();
        assert!(manager.install_task(&current, duplicate_task).is_err());
        tokio::time::timeout(std::time::Duration::from_secs(1), duplicate_cancelled)
            .await
            .expect("duplicate task cancellation timeout")
            .expect("duplicate task cancellation signal");

        manager
            .invalidate(&current.session_id)
            .expect("invalidate current")
            .expect("installed task")
            .abort();
    }

    #[tokio::test]
    async fn invalidation_returns_installed_task_handle() {
        let manager = RoomConnectionManager::default();
        let lease = manager.reserve(6).expect("reserve");
        let task = tauri::async_runtime::spawn(std::future::pending());
        manager.install_task(&lease, task).expect("install");

        let task = manager
            .invalidate(&lease.session_id)
            .expect("invalidate")
            .expect("task");
        task.abort();
    }

    #[tokio::test]
    async fn invalidation_returns_only_the_target_task_handle() {
        let manager = RoomConnectionManager::default();
        let left = resolved_session(&manager, 1, 101);
        let right = resolved_session(&manager, 2, 202);
        manager
            .install_task(&left, tauri::async_runtime::spawn(std::future::pending()))
            .expect("install left");
        manager
            .install_task(&right, tauri::async_runtime::spawn(std::future::pending()))
            .expect("install right");

        manager
            .invalidate(&left.session_id)
            .expect("invalidate left")
            .expect("left task")
            .abort();

        assert_eq!(manager.snapshot().expect("snapshot").len(), 1);
        assert_eq!(
            manager.snapshot().expect("snapshot")[0].session_id,
            right.session_id
        );
        manager
            .invalidate(&right.session_id)
            .expect("invalidate right")
            .expect("right task")
            .abort();
    }

    #[tokio::test]
    async fn invalidation_all_returns_every_task_handle() {
        let manager = RoomConnectionManager::default();
        for room_id in 1..=3 {
            let lease = resolved_session(&manager, room_id, room_id + 100);
            manager
                .install_task(&lease, tauri::async_runtime::spawn(std::future::pending()))
                .expect("install");
        }

        let tasks = manager.invalidate_all().expect("invalidate all");
        assert_eq!(tasks.len(), 3);
        assert!(manager.snapshot().expect("snapshot").is_empty());
        for task in tasks {
            task.abort();
        }
    }

    #[tokio::test]
    async fn taken_task_terminates_before_final_session_invalidation() {
        let manager = RoomConnectionManager::default();
        let lease = resolved_session(&manager, 1, 101);
        manager
            .update_status(&lease, RoomSessionStatus::Connected, "已连接", Some(1))
            .expect("connected");
        let (task, cancelled) = guarded_pending_task_with_cancellation_signal(&lease);
        manager.install_task(&lease, task).expect("install");

        let taken = manager
            .take_task(&lease.session_id)
            .expect("take")
            .expect("session");
        assert!(manager.is_current(&lease));
        assert_eq!(manager.snapshot().expect("snapshot").len(), 1);
        assert_eq!(
            manager.connected_room(101).expect("canonical").session_id,
            lease.session_id
        );
        assert_eq!(
            manager
                .invalidate_taken(&lease.session_id)
                .expect_err("worker still running"),
            "会话任务尚未终止"
        );

        taken.abort();
        taken.wait().await;
        tokio::time::timeout(std::time::Duration::from_secs(1), cancelled)
            .await
            .expect("task cancellation timeout")
            .expect("task cancellation signal");
        assert!(manager.is_current(&lease));

        assert!(manager
            .invalidate_taken(&lease.session_id)
            .expect("final invalidate"));
        assert!(manager.snapshot().expect("final snapshot").is_empty());
    }

    #[tokio::test]
    async fn disconnect_before_install_waits_for_rejected_worker_termination() {
        let manager = RoomConnectionManager::default();
        let lease = resolved_session(&manager, 1, 101);
        let taken = manager
            .take_task(&lease.session_id)
            .expect("take pending")
            .expect("session");
        assert!(manager.is_current(&lease));

        let completion = lease.completion_guard();
        let (sender, cancelled) = oneshot::channel();
        let signal = CancellationSignal(Some(sender));
        let late_task = tauri::async_runtime::spawn(async move {
            let _completion = completion;
            let _signal = signal;
            std::future::pending().await
        });
        assert!(manager.install_task(&lease, late_task).is_err());

        taken.wait().await;
        tokio::time::timeout(std::time::Duration::from_secs(1), cancelled)
            .await
            .expect("late task cancellation timeout")
            .expect("late task cancellation signal");
        assert!(manager.is_current(&lease));

        manager
            .invalidate_taken(&lease.session_id)
            .expect("final invalidate");
        assert!(manager.snapshot().expect("final snapshot").is_empty());
    }

    #[tokio::test]
    async fn take_all_terminates_every_task_before_final_invalidation() {
        let manager = RoomConnectionManager::default();
        let mut cancelled = Vec::new();
        for room_id in 1..=2 {
            let lease = resolved_session(&manager, room_id, room_id + 100);
            let (task, receiver) = guarded_pending_task_with_cancellation_signal(&lease);
            manager.install_task(&lease, task).expect("install");
            cancelled.push(receiver);
        }

        let tasks = manager.take_all_tasks().expect("take all");
        assert_eq!(tasks.len(), 2);
        assert_eq!(manager.snapshot().expect("snapshot").len(), 2);
        assert_eq!(
            manager
                .invalidate_all_taken()
                .expect_err("workers still running"),
            "仍有会话任务未终止"
        );
        for task in &tasks {
            task.abort();
        }
        for task in tasks {
            task.wait().await;
        }
        for receiver in cancelled {
            tokio::time::timeout(std::time::Duration::from_secs(1), receiver)
                .await
                .expect("task cancellation timeout")
                .expect("task cancellation signal");
        }
        assert_eq!(manager.snapshot().expect("before final snapshot").len(), 2);

        manager
            .invalidate_all_taken()
            .expect("final invalidate all");
        assert!(manager.snapshot().expect("final snapshot").is_empty());
    }

    #[tokio::test]
    async fn take_all_blocks_new_reservations_until_final_invalidation() {
        let manager = RoomConnectionManager::default();
        let lease = resolved_session(&manager, 1, 101);
        let (task, cancelled) = guarded_pending_task_with_cancellation_signal(&lease);
        manager.install_task(&lease, task).expect("install");

        let tasks = manager.take_all_tasks().expect("take all");
        assert_eq!(tasks.len(), 1);
        assert_eq!(
            manager.reserve(2).expect_err("reserve while closing all"),
            "正在断开全部直播间"
        );
        let error = match manager.take_task(&lease.session_id) {
            Err(error) => error,
            Ok(_) => panic!("single take while closing all must fail"),
        };
        assert_eq!(error, "正在断开全部直播间");

        for task in &tasks {
            task.abort();
        }
        for task in tasks {
            task.wait().await;
        }
        tokio::time::timeout(std::time::Duration::from_secs(1), cancelled)
            .await
            .expect("task cancellation timeout")
            .expect("task cancellation signal");

        manager
            .invalidate_all_taken()
            .expect("final invalidate all");
        manager.reserve(2).expect("reserve after final invalidate");
    }
}
