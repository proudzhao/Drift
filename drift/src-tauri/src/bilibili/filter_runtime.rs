use std::collections::HashMap;
use std::sync::Mutex;

use super::room_manager::{RoomConnectionManager, SessionLease};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub(crate) const FILTER_RUNTIME_STATUS_EVENT: &str = "filter-runtime-status";
const FAN_MEDAL_PAUSE_REASON: &str = "fan_medal_protocol_unknown";
const STALE_PAUSE_REPORT_ERROR: &str = "粉丝牌规则暂停上报的直播间已过期";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RoomFilterRuntimeStatus {
    pub room_id: u64,
    pub paused_fan_medal_rule_ids: Vec<String>,
    pub pause_reason: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FilterRuntimeStatus {
    pub rooms: Vec<RoomFilterRuntimeStatus>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FilterRuntimeOwner {
    session_id: String,
    generation: u64,
}

impl FilterRuntimeOwner {
    pub(crate) fn from_lease(lease: &SessionLease) -> Self {
        Self::new(&lease.session_id, lease.generation)
    }

    fn new(session_id: &str, generation: u64) -> Self {
        Self {
            session_id: session_id.to_string(),
            generation,
        }
    }
}

#[derive(Debug, Clone)]
struct FilterRuntimeEntry {
    owner: FilterRuntimeOwner,
    status: RoomFilterRuntimeStatus,
}

#[derive(Default)]
pub struct FilterRuntimeState {
    inner: Mutex<HashMap<u64, FilterRuntimeEntry>>,
    publication_gate: Mutex<()>,
}

impl FilterRuntimeState {
    #[cfg(test)]
    fn reset_room(
        &self,
        room_id: u64,
        owner: &FilterRuntimeOwner,
    ) -> Result<FilterRuntimeStatus, String> {
        let mut rooms = self.inner.lock().map_err(|error| error.to_string())?;
        Self::apply_reset(&mut rooms, room_id, owner.clone())?;
        Ok(snapshot_rooms(&rooms))
    }

    pub(crate) fn reset_room_and_emit(
        &self,
        app: &AppHandle,
        room_id: u64,
        owner: FilterRuntimeOwner,
    ) -> Result<FilterRuntimeStatus, String> {
        self.publish_mutation(app, move |rooms| Self::apply_reset(rooms, room_id, owner))
    }

    fn apply_reset(
        rooms: &mut HashMap<u64, FilterRuntimeEntry>,
        room_id: u64,
        owner: FilterRuntimeOwner,
    ) -> Result<bool, String> {
        if room_id == 0 {
            return Err("直播间号必须大于 0".to_string());
        }
        rooms.insert(
            room_id,
            FilterRuntimeEntry {
                owner,
                status: RoomFilterRuntimeStatus {
                    room_id,
                    paused_fan_medal_rule_ids: Vec::new(),
                    pause_reason: None,
                },
            },
        );
        Ok(true)
    }

    #[cfg(test)]
    fn remove_room_if_owned(
        &self,
        room_id: u64,
        owner: &FilterRuntimeOwner,
    ) -> Result<FilterRuntimeStatus, String> {
        let mut rooms = self.inner.lock().map_err(|error| error.to_string())?;
        Self::apply_remove_if_owned(&mut rooms, room_id, owner);
        Ok(snapshot_rooms(&rooms))
    }

    pub(crate) fn remove_rooms_if_owned_and_emit(
        &self,
        app: &AppHandle,
        room_owners: Vec<(u64, FilterRuntimeOwner)>,
    ) -> Result<FilterRuntimeStatus, String> {
        self.publish_mutation(app, move |rooms| {
            Ok(room_owners
                .into_iter()
                .fold(false, |changed, (room_id, owner)| {
                    Self::apply_remove_if_owned(rooms, room_id, &owner) || changed
                }))
        })
    }

    fn apply_remove_if_owned(
        rooms: &mut HashMap<u64, FilterRuntimeEntry>,
        room_id: u64,
        owner: &FilterRuntimeOwner,
    ) -> bool {
        if rooms
            .get(&room_id)
            .is_some_and(|entry| entry.owner == *owner)
        {
            rooms.remove(&room_id);
            true
        } else {
            false
        }
    }

    fn apply_pause(
        rooms: &mut HashMap<u64, FilterRuntimeEntry>,
        room_id: u64,
        owner: &FilterRuntimeOwner,
        rule_ids: Vec<String>,
    ) -> Result<bool, String> {
        if room_id == 0 {
            return Err(STALE_PAUSE_REPORT_ERROR.to_string());
        }
        let Some(entry) = rooms.get_mut(&room_id) else {
            return Err(STALE_PAUSE_REPORT_ERROR.to_string());
        };
        if entry.owner != *owner {
            return Err(STALE_PAUSE_REPORT_ERROR.to_string());
        }

        let mut rule_ids: Vec<String> = rule_ids
            .into_iter()
            .map(|rule_id| rule_id.trim().to_string())
            .filter(|rule_id| !rule_id.is_empty())
            .collect();
        rule_ids.sort();
        rule_ids.dedup();

        let before = entry.status.clone();
        if !rule_ids.is_empty() {
            entry.status.paused_fan_medal_rule_ids.extend(rule_ids);
            entry.status.paused_fan_medal_rule_ids.sort();
            entry.status.paused_fan_medal_rule_ids.dedup();
            entry.status.pause_reason = Some(FAN_MEDAL_PAUSE_REASON.to_string());
        }
        Ok(entry.status != before)
    }

    fn publish_mutation(
        &self,
        app: &AppHandle,
        mutate: impl FnOnce(&mut HashMap<u64, FilterRuntimeEntry>) -> Result<bool, String>,
    ) -> Result<FilterRuntimeStatus, String> {
        self.publish_mutation_with(mutate, |status| emit_filter_runtime_status(app, status))
    }

    fn publish_mutation_with(
        &self,
        mutate: impl FnOnce(&mut HashMap<u64, FilterRuntimeEntry>) -> Result<bool, String>,
        publish: impl FnOnce(&FilterRuntimeStatus) -> Result<(), String>,
    ) -> Result<FilterRuntimeStatus, String> {
        let _publication_gate = self
            .publication_gate
            .lock()
            .map_err(|error| error.to_string())?;
        let (status, changed) = {
            let mut rooms = self.inner.lock().map_err(|error| error.to_string())?;
            let changed = mutate(&mut rooms)?;
            (snapshot_rooms(&rooms), changed)
        };
        if changed {
            publish(&status)?;
        }
        Ok(status)
    }

    pub(crate) fn snapshot(&self) -> Result<FilterRuntimeStatus, String> {
        let rooms = self.inner.lock().map_err(|error| error.to_string())?;
        Ok(snapshot_rooms(&rooms))
    }
}

fn snapshot_rooms(rooms: &HashMap<u64, FilterRuntimeEntry>) -> FilterRuntimeStatus {
    let mut rooms: Vec<_> = rooms.values().map(|entry| entry.status.clone()).collect();
    rooms.sort_by_key(|status| status.room_id);
    FilterRuntimeStatus { rooms }
}

pub(crate) fn emit_filter_runtime_status(
    app: &AppHandle,
    status: &FilterRuntimeStatus,
) -> Result<(), String> {
    app.emit(FILTER_RUNTIME_STATUS_EVENT, status)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_filter_runtime_status(
    state: tauri::State<'_, FilterRuntimeState>,
) -> Result<FilterRuntimeStatus, String> {
    state.snapshot()
}

#[tauri::command]
pub fn pause_fan_medal_rules_for_session(
    app: AppHandle,
    state: tauri::State<'_, FilterRuntimeState>,
    session_id: String,
    room_id: u64,
    rule_ids: Vec<String>,
) -> Result<FilterRuntimeStatus, String> {
    let owner = app
        .state::<RoomConnectionManager>()
        .resolved_room_lease(&session_id, room_id)?
        .map(|lease| FilterRuntimeOwner::from_lease(&lease))
        .ok_or_else(|| STALE_PAUSE_REPORT_ERROR.to_string())?;
    state.publish_mutation(&app, move |rooms| {
        FilterRuntimeState::apply_pause(rooms, room_id, &owner, rule_ids)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    use std::thread;
    use std::time::Duration;

    fn owner(session_id: &str, generation: u64) -> FilterRuntimeOwner {
        FilterRuntimeOwner::new(session_id, generation)
    }

    fn pause_room(
        state: &FilterRuntimeState,
        room_id: u64,
        rule_ids: Vec<String>,
    ) -> Result<FilterRuntimeStatus, String> {
        let mut rooms = state.inner.lock().map_err(|error| error.to_string())?;
        let owner = rooms
            .get(&room_id)
            .map(|entry| entry.owner.clone())
            .ok_or_else(|| STALE_PAUSE_REPORT_ERROR.to_string())?;
        FilterRuntimeState::apply_pause(&mut rooms, room_id, &owner, rule_ids)?;
        Ok(snapshot_rooms(&rooms))
    }

    fn pause_room_as(
        state: &FilterRuntimeState,
        owner: &FilterRuntimeOwner,
        room_id: u64,
        rule_ids: Vec<String>,
    ) -> Result<FilterRuntimeStatus, String> {
        let mut rooms = state.inner.lock().map_err(|error| error.to_string())?;
        FilterRuntimeState::apply_pause(&mut rooms, room_id, owner, rule_ids)?;
        Ok(snapshot_rooms(&rooms))
    }

    #[test]
    fn old_owner_cannot_remove_a_new_owner_room_state() {
        let state = FilterRuntimeState::default();
        let old_owner = owner("room-session-1", 1);
        let new_owner = owner("room-session-2", 2);
        state.reset_room(6, &old_owner).expect("old room");
        pause_room(&state, 6, vec!["fan-only".into()]).expect("old pause");
        state.reset_room(6, &new_owner).expect("new room");

        state
            .remove_room_if_owned(6, &old_owner)
            .expect("old cleanup must be a no-op");
        let snapshot = state.snapshot().expect("snapshot");
        assert_eq!(snapshot.rooms.len(), 1);
        assert_eq!(snapshot.rooms[0].room_id, 6);
        assert!(snapshot.rooms[0].paused_fan_medal_rule_ids.is_empty());
    }

    #[test]
    fn replacement_lease_rejects_old_removal_and_late_pause_report() {
        let manager = RoomConnectionManager::default();
        let state = FilterRuntimeState::default();
        let old_lease = manager.reserve(6).expect("old lease");
        manager
            .resolve_room(&old_lease, 6, 60)
            .expect("old room binding");
        let old_owner = FilterRuntimeOwner::from_lease(&old_lease);
        state.reset_room(6, &old_owner).expect("old reset");
        manager
            .invalidate(&old_lease.session_id)
            .expect("remove old lease");
        let replacement_lease = manager.reserve(6).expect("replacement lease");
        manager
            .resolve_room(&replacement_lease, 6, 60)
            .expect("replacement room binding");
        let replacement_owner = FilterRuntimeOwner::from_lease(&replacement_lease);
        state
            .reset_room(6, &replacement_owner)
            .expect("replacement reset");
        state
            .remove_room_if_owned(6, &old_owner)
            .expect("old removal is ignored");

        assert!(manager
            .resolved_room_lease(&old_lease.session_id, 6)
            .expect("old lease lookup")
            .is_none());

        let error = pause_room_as(&state, &old_owner, 6, vec!["fan-only".into()])
            .expect_err("old pause report must be rejected");

        assert_eq!(error, STALE_PAUSE_REPORT_ERROR);
        let snapshot = state.snapshot().expect("replacement snapshot");
        assert_eq!(snapshot.rooms.len(), 1);
        assert!(snapshot.rooms[0].paused_fan_medal_rule_ids.is_empty());
        assert_eq!(snapshot.rooms[0].pause_reason, None);
    }

    #[test]
    fn serializes_complete_snapshot_publication_order() {
        let state = Arc::new(FilterRuntimeState::default());
        let (event_sender, event_receiver) = mpsc::channel();
        let (release_first_sender, release_first_receiver) = mpsc::channel();

        let first_state = Arc::clone(&state);
        let first_events = event_sender.clone();
        let first = thread::spawn(move || {
            first_state.publish_mutation_with(
                |rooms| FilterRuntimeState::apply_reset(rooms, 6, owner("first", 1)),
                |status| {
                    first_events.send(status.clone()).expect("first event");
                    release_first_receiver.recv().expect("release first");
                    Ok(())
                },
            )
        });

        let first_snapshot = event_receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("first event arrives");
        assert_eq!(
            first_snapshot
                .rooms
                .iter()
                .map(|room| room.room_id)
                .collect::<Vec<_>>(),
            [6]
        );

        let second_state = Arc::clone(&state);
        let second_events = event_sender;
        let second = thread::spawn(move || {
            second_state.publish_mutation_with(
                |rooms| FilterRuntimeState::apply_reset(rooms, 7, owner("second", 2)),
                |status| {
                    second_events.send(status.clone()).expect("second event");
                    Ok(())
                },
            )
        });

        assert!(event_receiver
            .recv_timeout(Duration::from_millis(100))
            .is_err());
        release_first_sender.send(()).expect("release first");
        first.join().expect("first thread").expect("first mutation");
        let second_snapshot = event_receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("second event arrives");
        second
            .join()
            .expect("second thread")
            .expect("second mutation");
        assert_eq!(
            second_snapshot
                .rooms
                .iter()
                .map(|room| room.room_id)
                .collect::<Vec<_>>(),
            [6, 7]
        );
    }

    #[test]
    fn pauses_rules_for_only_the_reported_room() {
        let state = FilterRuntimeState::default();
        state.reset_room(6, &owner("room-6", 6)).expect("room 6");
        state.reset_room(7, &owner("room-7", 7)).expect("room 7");
        pause_room(&state, 6, vec!["fan-only".into()]).expect("pause room 6");
        let snapshot = state.snapshot().expect("snapshot");
        assert_eq!(snapshot.rooms.len(), 2);
        assert_eq!(snapshot.rooms[0].room_id, 6);
        assert_eq!(snapshot.rooms[0].paused_fan_medal_rule_ids, ["fan-only"]);
        assert!(snapshot.rooms[1].paused_fan_medal_rule_ids.is_empty());
    }

    #[test]
    fn retry_and_disconnect_change_only_one_room() {
        let state = FilterRuntimeState::default();
        for room_id in [6, 7] {
            state
                .reset_room(room_id, &owner(&format!("room-{room_id}"), room_id))
                .expect("room");
            pause_room(&state, room_id, vec!["fan-only".into()]).expect("pause");
        }
        state
            .reset_room(6, &owner("retry-room-6", 8))
            .expect("retry room 6");
        state
            .remove_room_if_owned(7, &owner("room-7", 7))
            .expect("disconnect room 7");
        let snapshot = state.snapshot().expect("snapshot");
        assert_eq!(snapshot.rooms.len(), 1);
        assert_eq!(snapshot.rooms[0].room_id, 6);
        assert!(snapshot.rooms[0].paused_fan_medal_rule_ids.is_empty());
    }

    #[test]
    fn rejects_stale_room_pause_reports_without_changing_state() {
        let state = FilterRuntimeState::default();
        state.reset_room(7, &owner("room-7", 7)).expect("reset");
        assert!(pause_room(&state, 6, vec!["stale".into()]).is_err());
        assert!(pause_room(&state, 0, vec!["zero".into()]).is_err());
        let snapshot = state.snapshot().expect("snapshot");
        assert!(snapshot.rooms[0].paused_fan_medal_rule_ids.is_empty());
        assert_eq!(snapshot.rooms[0].pause_reason, None);

        let json = serde_json::to_value(snapshot).expect("serialize snapshot");
        assert!(json.get("recentSenders").is_none());
        let rendered = serde_json::to_string(&json).expect("render snapshot");
        for sensitive_key in ["text", "message", "cookie", "token"] {
            assert!(!rendered.contains(&format!("\"{sensitive_key}\"")));
        }
    }
}
