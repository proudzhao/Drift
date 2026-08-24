use serde_json::Value;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    OnceLock,
};
use tracing::info;

const ENABLE_ENV: &str = "DRIFT_MEDAL_SAMPLE";
const LIMIT_ENV: &str = "DRIFT_MEDAL_SAMPLE_LIMIT";
const DEFAULT_SAMPLE_LIMIT: usize = 50;
static SAMPLE_LIMIT: OnceLock<Option<usize>> = OnceLock::new();
static SAMPLE_COUNT: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
enum MedalShape {
    Missing,
    Null,
    Empty,
    AnchorUid { matches_room: bool },
    Malformed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MedalLevelShape {
    Missing,
    Valid,
    Malformed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MedalLevelAgreement {
    Missing,
    Single,
    Agree,
    Conflict,
    Malformed,
}

#[derive(Clone, Copy)]
enum MedalLevelCandidate {
    Missing,
    Valid(u32),
    Malformed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DanmakuMedalSampleSummary {
    info_len: usize,
    legacy_len: Option<usize>,
    new_shape: MedalShape,
    legacy_shape: MedalShape,
    new_level_shape: MedalLevelShape,
    legacy_level_shape: MedalLevelShape,
    level_agreement: MedalLevelAgreement,
}

pub(crate) fn maybe_log_danmaku_sample(value: &Value, anchor_uid: u64) {
    let Some(limit) = sample_limit() else {
        return;
    };
    let sample_index = SAMPLE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
    if sample_index > limit {
        return;
    }
    if let Some(summary) = summarize_danmaku_medal_shape(value, anchor_uid) {
        info!(
            target: "drift::bilibili.medal_sample",
            sample_index,
            limit,
            ?summary,
            "danmaku medal payload summary"
        );
    }
}

fn sample_limit() -> Option<usize> {
    *SAMPLE_LIMIT.get_or_init(|| {
        if !env_enabled(ENABLE_ENV) {
            return None;
        }
        Some(
            std::env::var(LIMIT_ENV)
                .ok()
                .and_then(|value| value.parse().ok())
                .filter(|value| *value > 0)
                .unwrap_or(DEFAULT_SAMPLE_LIMIT),
        )
    })
}

fn env_enabled(name: &str) -> bool {
    std::env::var(name)
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

fn summarize_danmaku_medal_shape(
    value: &Value,
    anchor_uid: u64,
) -> Option<DanmakuMedalSampleSummary> {
    let info = value.get("info")?.as_array()?;
    let new_level = new_medal_level_candidate(info);
    let legacy_level = legacy_medal_level_candidate(info);
    Some(DanmakuMedalSampleSummary {
        info_len: info.len(),
        legacy_len: info.get(3).and_then(Value::as_array).map(Vec::len),
        new_shape: new_medal_shape(info, anchor_uid),
        legacy_shape: legacy_medal_shape(info, anchor_uid),
        new_level_shape: medal_level_shape(new_level),
        legacy_level_shape: medal_level_shape(legacy_level),
        level_agreement: medal_level_agreement(new_level, legacy_level),
    })
}

fn new_medal_level_candidate(info: &[Value]) -> MedalLevelCandidate {
    let Some(meta) = info.first().and_then(Value::as_array) else {
        return MedalLevelCandidate::Missing;
    };
    let Some(slot) = meta.get(15) else {
        return MedalLevelCandidate::Missing;
    };
    let Some(container) = parse_json_value(slot) else {
        return MedalLevelCandidate::Malformed;
    };
    let Some(medal) = container.get("user").and_then(|user| user.get("medal")) else {
        return MedalLevelCandidate::Missing;
    };
    if medal.is_null() {
        return MedalLevelCandidate::Missing;
    }
    medal_level_candidate(medal.get("level"))
}

fn legacy_medal_level_candidate(info: &[Value]) -> MedalLevelCandidate {
    let Some(value) = info.get(3) else {
        return MedalLevelCandidate::Missing;
    };
    let Some(medal) = value.as_array() else {
        return MedalLevelCandidate::Malformed;
    };
    if medal.is_empty() {
        return MedalLevelCandidate::Missing;
    }
    medal_level_candidate(medal.first())
}

fn medal_level_candidate(value: Option<&Value>) -> MedalLevelCandidate {
    let Some(value) = value else {
        return MedalLevelCandidate::Missing;
    };
    value
        .as_u64()
        .filter(|level| *level > 0)
        .and_then(|level| u32::try_from(level).ok())
        .map(MedalLevelCandidate::Valid)
        .unwrap_or(MedalLevelCandidate::Malformed)
}

fn medal_level_shape(candidate: MedalLevelCandidate) -> MedalLevelShape {
    match candidate {
        MedalLevelCandidate::Missing => MedalLevelShape::Missing,
        MedalLevelCandidate::Valid(_) => MedalLevelShape::Valid,
        MedalLevelCandidate::Malformed => MedalLevelShape::Malformed,
    }
}

fn medal_level_agreement(
    new_candidate: MedalLevelCandidate,
    legacy_candidate: MedalLevelCandidate,
) -> MedalLevelAgreement {
    match (new_candidate, legacy_candidate) {
        (MedalLevelCandidate::Malformed, _) | (_, MedalLevelCandidate::Malformed) => {
            MedalLevelAgreement::Malformed
        }
        (MedalLevelCandidate::Valid(new), MedalLevelCandidate::Valid(legacy)) => {
            if new == legacy {
                MedalLevelAgreement::Agree
            } else {
                MedalLevelAgreement::Conflict
            }
        }
        (MedalLevelCandidate::Valid(_), MedalLevelCandidate::Missing)
        | (MedalLevelCandidate::Missing, MedalLevelCandidate::Valid(_)) => {
            MedalLevelAgreement::Single
        }
        (MedalLevelCandidate::Missing, MedalLevelCandidate::Missing) => {
            MedalLevelAgreement::Missing
        }
    }
}

fn new_medal_shape(info: &[Value], anchor_uid: u64) -> MedalShape {
    let Some(meta) = info.first().and_then(Value::as_array) else {
        return MedalShape::Missing;
    };
    let Some(slot) = meta.get(15) else {
        return MedalShape::Missing;
    };
    let Some(container) = parse_json_value(slot) else {
        return MedalShape::Malformed;
    };
    let Some(medal) = container.get("user").and_then(|user| user.get("medal")) else {
        return MedalShape::Missing;
    };
    if medal.is_null() {
        return MedalShape::Null;
    }
    medal
        .get("ruid")
        .and_then(Value::as_u64)
        .filter(|uid| *uid > 0)
        .map(|uid| MedalShape::AnchorUid {
            matches_room: uid == anchor_uid,
        })
        .unwrap_or(MedalShape::Malformed)
}

fn legacy_medal_shape(info: &[Value], anchor_uid: u64) -> MedalShape {
    let Some(value) = info.get(3) else {
        return MedalShape::Missing;
    };
    let Some(medal) = value.as_array() else {
        return MedalShape::Malformed;
    };
    if medal.is_empty() {
        return MedalShape::Empty;
    }
    medal
        .get(12)
        .and_then(Value::as_u64)
        .filter(|uid| *uid > 0)
        .map(|uid| MedalShape::AnchorUid {
            matches_room: uid == anchor_uid,
        })
        .unwrap_or(MedalShape::Malformed)
}

fn parse_json_value(value: &Value) -> Option<Value> {
    match value {
        Value::String(text) => serde_json::from_str(text.trim()).ok(),
        Value::Object(_) => Some(value.clone()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn summarizes_new_and_legacy_medal_shapes_without_sensitive_values() {
        let payload = json!({
            "cmd": "DANMU_MSG",
            "info": [[0, 1, 25, 1, 1, 0, 0, "", 0, 0, 0, "", 0, "{}", "{}", {
                "user": { "uid": 778899, "base": { "name": "真实用户" }, "medal": { "ruid": 112233, "level": 34 } }
            }], "秘密正文", [778899, "真实用户"], [34, "牌子名", "主播名", 0, 0, "", 0, 0, 0, 0, 0, 1, 112233]]
        });
        let summary = summarize_danmaku_medal_shape(&payload, 112233).expect("summary");
        let rendered = format!("{:?}", summary);
        assert_eq!(summary.legacy_len, Some(13));
        assert_eq!(
            summary.new_shape,
            MedalShape::AnchorUid { matches_room: true }
        );
        assert_eq!(
            summary.legacy_shape,
            MedalShape::AnchorUid { matches_room: true }
        );
        assert_eq!(summary.new_level_shape, MedalLevelShape::Valid);
        assert_eq!(summary.legacy_level_shape, MedalLevelShape::Valid);
        assert_eq!(summary.level_agreement, MedalLevelAgreement::Agree);
        for secret in ["秘密正文", "真实用户", "牌子名", "778899", "112233", "34"] {
            assert!(!rendered.contains(secret));
        }
    }

    #[test]
    fn summarizes_level_shape_and_disagreement_without_values() {
        let payload = json!({
            "cmd": "DANMU_MSG",
            "info": [[0, 1, 25, 1, 1, 0, 0, "", 0, 0, 0, "", 0, "{}", "{}", {
                "user": { "medal": { "ruid": 7, "level": 34 } }
            }], "正文", [42, "用户"], [35, "牌", "主播", 0, 0, "", 0, 0, 0, 0, 0, 1, 7]]
        });
        let summary = summarize_danmaku_medal_shape(&payload, 7).expect("summary");
        let rendered = format!("{:?}", summary);

        assert_eq!(summary.new_level_shape, MedalLevelShape::Valid);
        assert_eq!(summary.legacy_level_shape, MedalLevelShape::Valid);
        assert_eq!(summary.level_agreement, MedalLevelAgreement::Conflict);
        for secret in ["正文", "用户", "主播", "34", "35"] {
            assert!(!rendered.contains(secret));
        }
    }

    #[test]
    fn marks_missing_and_malformed_level_shapes() {
        let payload = json!({
            "cmd": "DANMU_MSG",
            "info": [[0, 1, 25, 1, 1, 0, 0, "", 0, 0, 0, "", 0, "{}", "{}", {
                "user": { "medal": { "ruid": 7 } }
            }], "正文", [42, "用户"], ["secret-level", "牌", "主播", 0, 0, "", 0, 0, 0, 0, 0, 1, 7]]
        });
        let summary = summarize_danmaku_medal_shape(&payload, 7).expect("summary");
        let rendered = format!("{:?}", summary);

        assert_eq!(summary.new_level_shape, MedalLevelShape::Missing);
        assert_eq!(summary.legacy_level_shape, MedalLevelShape::Malformed);
        assert_eq!(summary.level_agreement, MedalLevelAgreement::Malformed);
        assert!(!rendered.contains("secret-level"));
    }

    #[test]
    fn distinguishes_missing_and_empty_shapes() {
        let payload = json!({ "cmd": "DANMU_MSG", "info": [[0, 1, 25], "正文", [42, "用户"], []] });
        let summary = summarize_danmaku_medal_shape(&payload, 7).expect("summary");
        assert_eq!(summary.new_shape, MedalShape::Missing);
        assert_eq!(summary.legacy_shape, MedalShape::Empty);
    }
}
