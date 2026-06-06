use serde_json::Value;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    OnceLock,
};
use tracing::info;

const ENABLE_ENV: &str = "DRIFT_EMOTE_SAMPLE";
const LIMIT_ENV: &str = "DRIFT_EMOTE_SAMPLE_LIMIT";
const DEFAULT_SAMPLE_LIMIT: usize = 50;
const MAX_JSON_CANDIDATES: usize = 8;
const MAX_TOP_LEVEL_KEYS: usize = 20;
const MAX_INDICATORS: usize = 32;

static SAMPLE_LIMIT: OnceLock<Option<usize>> = OnceLock::new();
static SAMPLE_COUNT: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
struct DanmakuEmoteSampleSummary {
    info_len: usize,
    text_chars: usize,
    meta_len: Option<usize>,
    user_info_len: Option<usize>,
    json_candidates: Vec<JsonCandidateSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct JsonCandidateSummary {
    path: String,
    top_level_keys: Vec<String>,
    indicators: Vec<FieldIndicatorSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FieldIndicatorSummary {
    path: String,
    value: String,
}

pub(crate) fn maybe_log_danmaku_sample(value: &Value) {
    let Some(limit) = sample_limit() else {
        return;
    };

    let sample_index = SAMPLE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
    if sample_index > limit {
        return;
    }

    if let Some(summary) = summarize_danmaku_for_emote_probe(value) {
        info!(
            target: "drift::bilibili.emote_sample",
            sample_index,
            limit,
            ?summary,
            "danmaku emote payload summary"
        );
    }
}

fn sample_limit() -> Option<usize> {
    *SAMPLE_LIMIT.get_or_init(|| {
        if !env_enabled(ENABLE_ENV) {
            return None;
        }

        let limit = std::env::var(LIMIT_ENV)
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_SAMPLE_LIMIT);
        Some(limit)
    })
}

fn env_enabled(name: &str) -> bool {
    std::env::var(name)
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        })
        .unwrap_or(false)
}

fn summarize_danmaku_for_emote_probe(value: &Value) -> Option<DanmakuEmoteSampleSummary> {
    let info_value = value.get("info")?;
    let info = info_value.as_array()?;
    let text_chars = info
        .get(1)
        .and_then(Value::as_str)
        .map(|text| text.chars().count())
        .unwrap_or(0);
    let meta_len = info.first().and_then(Value::as_array).map(Vec::len);
    let user_info_len = info.get(2).and_then(Value::as_array).map(Vec::len);
    let mut json_candidates = Vec::new();
    scan_json_candidates(info_value, "info", &mut json_candidates);

    Some(DanmakuEmoteSampleSummary {
        info_len: info.len(),
        text_chars,
        meta_len,
        user_info_len,
        json_candidates,
    })
}

fn scan_json_candidates(value: &Value, path: &str, candidates: &mut Vec<JsonCandidateSummary>) {
    if candidates.len() >= MAX_JSON_CANDIDATES {
        return;
    }

    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if !looks_like_json(trimmed) {
                return;
            }
            let Ok(parsed) = serde_json::from_str::<Value>(trimmed) else {
                return;
            };
            if !contains_emote_indicator(&parsed) {
                return;
            }
            candidates.push(summarize_json_candidate(path, &parsed));
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                scan_json_candidates(item, &format!("{}[{}]", path, index), candidates);
                if candidates.len() >= MAX_JSON_CANDIDATES {
                    return;
                }
            }
        }
        Value::Object(map) => {
            for (key, item) in map {
                scan_json_candidates(
                    item,
                    &format!("{}.{}", path, safe_key_for_path(key)),
                    candidates,
                );
                if candidates.len() >= MAX_JSON_CANDIDATES {
                    return;
                }
            }
        }
        _ => {}
    }
}

fn looks_like_json(value: &str) -> bool {
    (value.starts_with('{') && value.ends_with('}'))
        || (value.starts_with('[') && value.ends_with(']'))
}

fn summarize_json_candidate(path: &str, value: &Value) -> JsonCandidateSummary {
    let top_level_keys = match value {
        Value::Object(map) => map
            .keys()
            .take(MAX_TOP_LEVEL_KEYS)
            .map(|key| safe_key_for_log(key))
            .collect(),
        _ => Vec::new(),
    };
    let mut indicators = Vec::new();
    collect_indicators(value, path, &mut indicators);

    JsonCandidateSummary {
        path: path.to_string(),
        top_level_keys,
        indicators,
    }
}

fn collect_indicators(value: &Value, path: &str, indicators: &mut Vec<FieldIndicatorSummary>) {
    if indicators.len() >= MAX_INDICATORS {
        return;
    }

    match value {
        Value::Object(map) => {
            for (key, item) in map {
                let item_path = format!("{}.{}", path, safe_key_for_path(key));
                if is_interesting_key(key) || url_host_from_value(item).is_some() {
                    indicators.push(FieldIndicatorSummary {
                        path: item_path.clone(),
                        value: summarize_value(item),
                    });
                }
                collect_indicators(item, &item_path, indicators);
                if indicators.len() >= MAX_INDICATORS {
                    return;
                }
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                collect_indicators(item, &format!("{}[{}]", path, index), indicators);
                if indicators.len() >= MAX_INDICATORS {
                    return;
                }
            }
        }
        _ => {}
    }
}

fn contains_emote_indicator(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.iter().any(|(key, item)| {
            is_interesting_key(key)
                || url_host_from_value(item).is_some()
                || contains_emote_indicator(item)
        }),
        Value::Array(items) => items.iter().any(contains_emote_indicator),
        Value::String(text) => url_host(text).is_some(),
        _ => false,
    }
}

fn is_interesting_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    lower.contains("emot")
        || lower.contains("emoji")
        || lower.contains("url")
        || lower.contains("width")
        || lower.contains("height")
        || lower == "dm_type"
        || lower == "web_text"
        || lower == "content"
}

fn summarize_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(value) => format!("bool={}", value),
        Value::Number(value) => format!("number={}", value),
        Value::String(text) => {
            if let Some(host) = url_host(text) {
                format!("url_host={}", host)
            } else if looks_like_placeholder(text) {
                format!("placeholder_shape=bracketed,len={}", text.chars().count())
            } else {
                format!("string_len={}", text.chars().count())
            }
        }
        Value::Array(items) => format!("array_len={}", items.len()),
        Value::Object(map) => format!("object_len={}", map.len()),
    }
}

fn url_host_from_value(value: &Value) -> Option<String> {
    value.as_str().and_then(url_host)
}

fn url_host(value: &str) -> Option<String> {
    let rest = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"))?;
    let authority = rest.split('/').next().unwrap_or_default();
    let host = authority
        .rsplit('@')
        .next()
        .unwrap_or(authority)
        .split(':')
        .next()
        .unwrap_or_default();
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

fn looks_like_placeholder(value: &str) -> bool {
    value.starts_with('[') && value.ends_with(']') && value.chars().count() <= 32
}

fn safe_key_for_path(key: &str) -> String {
    if is_safe_field_name(key) {
        key.to_string()
    } else {
        format!("key_len_{}", key.chars().count())
    }
}

fn safe_key_for_log(key: &str) -> String {
    if is_safe_field_name(key) {
        key.to_string()
    } else {
        format!("key_len={}", key.chars().count())
    }
}

fn is_safe_field_name(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 48
        && key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn summarizes_emote_extra_without_sensitive_values() {
        let payload = json!({
            "cmd": "DANMU_MSG",
            "info": [
                [
                    0,
                    1,
                    25,
                    16777215,
                    1710000000,
                    0,
                    0,
                    "abc",
                    0,
                    0,
                    0,
                    "",
                    0,
                    "{}",
                    "{}",
                    "{\"dm_type\":1,\"emots\":{\"[dog]\":{\"url\":\"https://i0.hdslb.com/bfs/live/dog-secret.png?token=SESSDATA\",\"width\":64,\"height\":64}},\"web_text\":\"秘密正文[dog]\",\"content\":\"秘密正文[dog]\"}"
                ],
                "秘密正文[dog]",
                [42, "真实用户名"],
                []
            ]
        });

        let summary = summarize_danmaku_for_emote_probe(&payload).expect("summary");
        let rendered = format!("{:?}", summary);

        assert_eq!(summary.info_len, 4);
        assert_eq!(summary.text_chars, 9);
        assert_eq!(summary.meta_len, Some(16));
        assert_eq!(summary.user_info_len, Some(2));
        assert_eq!(summary.json_candidates.len(), 1);
        assert!(rendered.contains("info[0][15]"));
        assert!(rendered.contains("dm_type"));
        assert!(rendered.contains("emots"));
        assert!(rendered.contains("url_host=i0.hdslb.com"));
        assert!(rendered.contains("number=64"));
        assert!(!rendered.contains("秘密正文"));
        assert!(!rendered.contains("真实用户名"));
        assert!(!rendered.contains("dog-secret.png"));
        assert!(!rendered.contains("SESSDATA"));
        assert!(!rendered.contains("[dog]"));
    }

    #[test]
    fn ignores_json_without_emote_indicators() {
        let payload = json!({
            "cmd": "DANMU_MSG",
            "info": [
                [0, "{\"foo\":\"bar\",\"safe\":true}"],
                "普通弹幕",
                [7, "用户"],
                []
            ]
        });

        let summary = summarize_danmaku_for_emote_probe(&payload).expect("summary");

        assert!(summary.json_candidates.is_empty());
    }

    #[test]
    fn summarizes_plain_danmaku_shape() {
        let payload = json!({
            "cmd": "DANMU_MSG",
            "info": [
                [0, 1, 25, 16777215, 1710000000],
                "普通弹幕",
                [7, "用户"],
                []
            ]
        });

        let summary = summarize_danmaku_for_emote_probe(&payload).expect("summary");

        assert_eq!(summary.info_len, 4);
        assert_eq!(summary.text_chars, 4);
        assert_eq!(summary.meta_len, Some(5));
        assert_eq!(summary.user_info_len, Some(2));
        assert!(summary.json_candidates.is_empty());
    }
}
