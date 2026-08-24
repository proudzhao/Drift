use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub(crate) const FILTER_RUNTIME_STATUS_EVENT: &str = "filter-runtime-status";
const FAN_MEDAL_PAUSE_REASON: &str = "fan_medal_protocol_unknown";

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FilterRuntimeStatus {
    pub room_id: Option<u64>,
    pub paused_fan_medal_rule_ids: Vec<String>,
    pub pause_reason: Option<String>,
}

#[derive(Default)]
pub struct FilterRuntimeState {
    inner: Mutex<FilterRuntimeStatus>,
}

impl FilterRuntimeState {
    pub(crate) fn reset(&self, room_id: Option<u64>) -> Result<FilterRuntimeStatus, String> {
        let mut status = self.inner.lock().map_err(|error| error.to_string())?;
        *status = FilterRuntimeStatus {
            room_id,
            ..FilterRuntimeStatus::default()
        };
        Ok(status.clone())
    }

    pub(crate) fn set_room_id(&self, room_id: u64) -> Result<FilterRuntimeStatus, String> {
        if room_id == 0 {
            return Err("直播间号必须大于 0".to_string());
        }
        let mut status = self.inner.lock().map_err(|error| error.to_string())?;
        status.room_id = Some(room_id);
        Ok(status.clone())
    }

    pub(crate) fn pause_fan_medal_rules(
        &self,
        room_id: u64,
        rule_ids: Vec<String>,
    ) -> Result<FilterRuntimeStatus, String> {
        let mut status = self.inner.lock().map_err(|error| error.to_string())?;
        if room_id == 0 || status.room_id != Some(room_id) {
            return Err("粉丝牌规则暂停上报的直播间已过期".to_string());
        }

        let mut rule_ids: Vec<String> = rule_ids
            .into_iter()
            .map(|rule_id| rule_id.trim().to_string())
            .filter(|rule_id| !rule_id.is_empty())
            .collect();
        rule_ids.sort();
        rule_ids.dedup();

        if !rule_ids.is_empty() {
            status.paused_fan_medal_rule_ids.extend(rule_ids);
            status.paused_fan_medal_rule_ids.sort();
            status.paused_fan_medal_rule_ids.dedup();
            status.pause_reason = Some(FAN_MEDAL_PAUSE_REASON.to_string());
        }
        Ok(status.clone())
    }

    pub(crate) fn snapshot(&self) -> Result<FilterRuntimeStatus, String> {
        self.inner
            .lock()
            .map(|status| status.clone())
            .map_err(|error| error.to_string())
    }
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
    room_id: u64,
    rule_ids: Vec<String>,
) -> Result<FilterRuntimeStatus, String> {
    let before = state.snapshot()?;
    let status = state.pause_fan_medal_rules(room_id, rule_ids)?;
    if status != before {
        emit_filter_runtime_status(&app, &status)?;
    }
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deduplicates_paused_rules_and_reset_clears_session_state() {
        let state = FilterRuntimeState::default();
        state.reset(Some(6)).expect("reset");
        state
            .pause_fan_medal_rules(6, vec!["b".into(), "a".into(), "a".into()])
            .expect("pause");
        state
            .pause_fan_medal_rules(6, vec!["".into(), " a ".into()])
            .expect("repeat pause");
        let paused = state.snapshot().expect("snapshot");
        assert_eq!(paused.paused_fan_medal_rule_ids, vec!["a", "b"]);
        assert_eq!(
            paused.pause_reason.as_deref(),
            Some("fan_medal_protocol_unknown")
        );

        state.reset(Some(7)).expect("reset again");
        let snapshot = state.snapshot().expect("snapshot");
        assert_eq!(snapshot.room_id, Some(7));
        assert!(snapshot.paused_fan_medal_rule_ids.is_empty());
        assert_eq!(snapshot.pause_reason, None);
    }

    #[test]
    fn rejects_stale_room_pause_reports_without_changing_state() {
        let state = FilterRuntimeState::default();
        state.reset(Some(7)).expect("reset");
        assert!(state
            .pause_fan_medal_rules(6, vec!["stale".into()])
            .is_err());
        assert!(state.pause_fan_medal_rules(0, vec!["zero".into()]).is_err());
        let snapshot = state.snapshot().expect("snapshot");
        assert!(snapshot.paused_fan_medal_rule_ids.is_empty());
        assert_eq!(snapshot.pause_reason, None);
    }

    #[test]
    fn set_room_id_preserves_pause_state_and_snapshot_is_sanitized() {
        let state = FilterRuntimeState::default();
        state.reset(None).expect("reset");
        state.set_room_id(6).expect("set room");
        state
            .pause_fan_medal_rules(6, vec!["fan-only".to_string()])
            .expect("pause");
        let snapshot = state.snapshot().expect("snapshot");
        assert_eq!(snapshot.room_id, Some(6));
        assert_eq!(snapshot.paused_fan_medal_rule_ids, vec!["fan-only"]);

        let json = serde_json::to_value(snapshot).expect("serialize snapshot");
        assert!(json.get("recentSenders").is_none());
        let rendered = serde_json::to_string(&json).expect("render snapshot");
        for sensitive_key in ["text", "message", "cookie", "token"] {
            assert!(!rendered.contains(&format!("\"{sensitive_key}\"")));
        }
    }
}
