use serde_json::Value;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    OnceLock,
};
use tracing::info;

const ENABLE_ENV: &str = "DRIFT_SC_SAMPLE";
const LIMIT_ENV: &str = "DRIFT_SC_SAMPLE_LIMIT";
const DEFAULT_SAMPLE_LIMIT: usize = 20;
const MAX_DATA_KEYS: usize = 32;

static SAMPLE_LIMIT: OnceLock<Option<usize>> = OnceLock::new();
static SAMPLE_COUNT: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
struct SuperChatSampleSummary {
    cmd: String,
    data_object_len: Option<usize>,
    data_keys: Vec<String>,
    indicators: Vec<SuperChatFieldIndicator>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SuperChatFieldIndicator {
    path: String,
    role: &'static str,
    value: String,
    display_candidate: bool,
}

struct FieldSpec {
    path: &'static [&'static str],
    role: &'static str,
}

const FIELD_SPECS: &[FieldSpec] = &[
    FieldSpec {
        path: &["data", "message"],
        role: "text",
    },
    FieldSpec {
        path: &["data", "message_trans"],
        role: "translated_text",
    },
    FieldSpec {
        path: &["data", "price"],
        role: "price",
    },
    FieldSpec {
        path: &["data", "rmb"],
        role: "price",
    },
    FieldSpec {
        path: &["data", "time"],
        role: "duration",
    },
    FieldSpec {
        path: &["data", "start_time"],
        role: "start_time",
    },
    FieldSpec {
        path: &["data", "end_time"],
        role: "end_time",
    },
    FieldSpec {
        path: &["data", "background_color"],
        role: "color",
    },
    FieldSpec {
        path: &["data", "background_color_start"],
        role: "color",
    },
    FieldSpec {
        path: &["data", "background_color_end"],
        role: "color",
    },
    FieldSpec {
        path: &["data", "user_info", "uname"],
        role: "user_name",
    },
    FieldSpec {
        path: &["data", "user_info", "uid"],
        role: "user_id",
    },
    FieldSpec {
        path: &["data", "uid"],
        role: "user_id",
    },
    FieldSpec {
        path: &["data", "uinfo", "uid"],
        role: "user_id",
    },
    FieldSpec {
        path: &["data", "uinfo", "base", "name"],
        role: "user_name",
    },
];

pub(crate) fn maybe_log_super_chat_sample(value: &Value) {
    let Some(limit) = sample_limit() else {
        return;
    };

    let sample_index = SAMPLE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
    if sample_index > limit {
        return;
    }

    if let Some(summary) = summarize_super_chat_sample(value) {
        info!(
            target: "drift::bilibili.sc_sample",
            sample_index,
            limit,
            ?summary,
            "super chat payload summary"
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

fn summarize_super_chat_sample(value: &Value) -> Option<SuperChatSampleSummary> {
    let cmd = value.get("cmd").and_then(Value::as_str)?;
    if !is_super_chat_command(cmd) {
        return None;
    }

    let data = value.get("data");
    let data_object_len = data.and_then(Value::as_object).map(|data| data.len());
    let data_keys = data
        .and_then(Value::as_object)
        .map(|data| {
            data.keys()
                .take(MAX_DATA_KEYS)
                .map(|key| safe_key_for_log(key))
                .collect()
        })
        .unwrap_or_default();
    let indicators = FIELD_SPECS
        .iter()
        .filter_map(|spec| summarize_field(value, spec))
        .collect();

    Some(SuperChatSampleSummary {
        cmd: safe_command(cmd),
        data_object_len,
        data_keys,
        indicators,
    })
}

fn summarize_field(value: &Value, spec: &FieldSpec) -> Option<SuperChatFieldIndicator> {
    let field = value_at_path(value, spec.path)?;
    Some(SuperChatFieldIndicator {
        path: safe_path(spec.path),
        role: spec.role,
        value: summarize_value(field, spec.role),
        display_candidate: is_display_candidate(field),
    })
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

fn is_super_chat_command(value: &str) -> bool {
    matches!(value, "SUPER_CHAT_MESSAGE" | "SUPER_CHAT_MESSAGE_JPN")
}

fn safe_command(value: &str) -> String {
    if is_super_chat_command(value) {
        value.to_string()
    } else {
        format!("cmd_len={}", value.chars().count())
    }
}

fn safe_path(path: &[&str]) -> String {
    path.iter()
        .map(|part| safe_key_for_path(part))
        .collect::<Vec<_>>()
        .join(".")
}

fn summarize_value(value: &Value, role: &str) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(value) => format!("bool={}", value),
        Value::Number(value) if role == "user_id" => {
            format!("number_digits={}", value.to_string().chars().count())
        }
        Value::Number(value) => format!("number={}", value),
        Value::String(text) if role == "color" => summarize_color(text),
        Value::String(text) if role == "user_name" => {
            format!("string_len={}", text.chars().count())
        }
        Value::String(text) if role == "text" || role == "translated_text" => {
            format!("string_len={}", text.chars().count())
        }
        Value::String(text) => format!("string_len={}", text.chars().count()),
        Value::Array(items) => format!("array_len={}", items.len()),
        Value::Object(map) => format!("object_len={}", map.len()),
    }
}

fn summarize_color(value: &str) -> String {
    let trimmed = value.trim();
    if is_hex_color(trimmed) {
        format!("hex_color_len={}", trimmed.chars().count())
    } else {
        format!("string_len={}", value.chars().count())
    }
}

fn is_hex_color(value: &str) -> bool {
    let Some(rest) = value.strip_prefix('#') else {
        return false;
    };
    matches!(rest.len(), 3 | 6 | 8) && rest.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_display_candidate(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(_) => true,
        Value::Number(_) => true,
        Value::String(text) => !text.trim().is_empty(),
        Value::Array(items) => !items.is_empty(),
        Value::Object(map) => !map.is_empty(),
    }
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
    fn summarizes_super_chat_without_sensitive_values() {
        let payload = json!({
            "cmd": "SUPER_CHAT_MESSAGE",
            "data": {
                "id": 123,
                "message": "这是一条需要脱敏的醒目留言",
                "message_trans": "translated secret text",
                "price": 30,
                "time": 60,
                "start_time": 1710000000,
                "end_time": 1710000060,
                "background_color": "#F5A962",
                "background_color_start": "#112233",
                "background_color_end": "linear-gradient(secret)",
                "uid": 1234567890,
                "uinfo": {
                    "uid": 1234567890,
                    "base": {
                        "name": "另一个真实用户名"
                    }
                },
                "user_info": {
                    "uid": 1234567890,
                    "uname": "真实用户名"
                },
                "cookie": "SESSDATA=secret"
            }
        });

        let summary = summarize_super_chat_sample(&payload).expect("summary");
        let rendered = format!("{:?}", summary);

        assert_eq!(summary.cmd, "SUPER_CHAT_MESSAGE");
        assert_eq!(summary.data_object_len, Some(14));
        assert!(summary.data_keys.contains(&"message".to_string()));
        assert!(summary.data_keys.contains(&"user_info".to_string()));
        assert!(summary.data_keys.contains(&"uinfo".to_string()));
        assert!(rendered.contains("data.message"));
        assert!(rendered.contains("data.uid"));
        assert!(rendered.contains("data.uinfo.base.name"));
        assert!(rendered.contains("role: \"text\""));
        assert!(rendered.contains("string_len=13"));
        assert!(rendered.contains("number=30"));
        assert!(rendered.contains("hex_color_len=7"));
        assert!(rendered.contains("number_digits=10"));
        assert!(!rendered.contains("这是一条需要脱敏的醒目留言"));
        assert!(!rendered.contains("translated secret text"));
        assert!(!rendered.contains("真实用户名"));
        assert!(!rendered.contains("另一个真实用户名"));
        assert!(!rendered.contains("1234567890"));
        assert!(!rendered.contains("SESSDATA=secret"));
        assert!(!rendered.contains("linear-gradient(secret)"));
    }

    #[test]
    fn summarizes_missing_data_shape_without_panicking() {
        let payload = json!({
            "cmd": "SUPER_CHAT_MESSAGE_JPN"
        });

        let summary = summarize_super_chat_sample(&payload).expect("summary");

        assert_eq!(summary.cmd, "SUPER_CHAT_MESSAGE_JPN");
        assert_eq!(summary.data_object_len, None);
        assert!(summary.data_keys.is_empty());
        assert!(summary.indicators.is_empty());
    }

    #[test]
    fn ignores_non_super_chat_commands() {
        let payload = json!({
            "cmd": "DANMU_MSG",
            "data": {
                "message": "普通弹幕"
            }
        });

        assert!(summarize_super_chat_sample(&payload).is_none());
    }
}
