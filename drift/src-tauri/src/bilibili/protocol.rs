use super::types::{
    LiveMessage, LiveMessageKind, LiveMessageSegment, LiveMessageSegmentKind, Packet, HEADER_SIZE,
};
use super::{emote_probe, sc_probe};
use flate2::read::ZlibDecoder;
use serde_json::Value;
use std::io::Read;
use tracing::warn;

pub(crate) fn build_packet(operation: u32, protocol: u16, payload: &[u8]) -> Vec<u8> {
    let packet_len = (HEADER_SIZE + payload.len()) as u32;
    let mut packet = Vec::with_capacity(packet_len as usize);
    packet.extend_from_slice(&packet_len.to_be_bytes());
    packet.extend_from_slice(&(HEADER_SIZE as u16).to_be_bytes());
    packet.extend_from_slice(&protocol.to_be_bytes());
    packet.extend_from_slice(&operation.to_be_bytes());
    packet.extend_from_slice(&1u32.to_be_bytes());
    packet.extend_from_slice(payload);
    packet
}

pub(crate) fn unpack_packets(bytes: &[u8]) -> Result<Vec<Packet>, String> {
    let mut packets = Vec::new();
    let mut offset = 0usize;

    while offset + HEADER_SIZE <= bytes.len() {
        let packet_len = read_u32(bytes, offset)? as usize;
        let header_len = read_u16(bytes, offset + 4)? as usize;
        let protocol = read_u16(bytes, offset + 6)?;
        let operation = read_u32(bytes, offset + 8)?;

        if packet_len < header_len || offset + packet_len > bytes.len() {
            return Err(format!("非法数据包长度：{}", packet_len));
        }

        let payload = &bytes[offset + header_len..offset + packet_len];
        match protocol {
            0 | 1 => packets.push(Packet {
                operation,
                payload: payload.to_vec(),
            }),
            2 => packets.extend(unpack_packets(&decompress_zlib(payload)?)?),
            3 => packets.extend(unpack_packets(&decompress_brotli(payload)?)?),
            _ => warn!(
                target: "drift::bilibili.proto",
                protocol,
                operation,
                "unknown bilibili packet protocol"
            ),
        }

        offset += packet_len;
    }

    Ok(packets)
}

fn decompress_zlib(payload: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = ZlibDecoder::new(payload);
    let mut output = Vec::new();
    decoder
        .read_to_end(&mut output)
        .map_err(|error| format!("zlib 解压失败：{}", error))?;
    Ok(output)
}

fn decompress_brotli(payload: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = brotli::Decompressor::new(payload, 4096);
    let mut output = Vec::new();
    decoder
        .read_to_end(&mut output)
        .map_err(|error| format!("brotli 解压失败：{}", error))?;
    Ok(output)
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "数据包 u16 越界".to_string())?;
    Ok(u16::from_be_bytes(slice.try_into().unwrap()))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "数据包 u32 越界".to_string())?;
    Ok(u32::from_be_bytes(slice.try_into().unwrap()))
}

pub(crate) fn handle_packet(
    app: &tauri::AppHandle,
    status_emitter: impl Fn(&tauri::AppHandle, &str, &str),
    room_id: u64,
    self_uid: Option<u64>,
    bytes: &[u8],
) -> Result<Vec<LiveMessage>, String> {
    let packets = unpack_packets(bytes)?;
    let mut messages = Vec::new();

    for packet in packets {
        match packet.operation {
            3 => {
                if packet.payload.len() >= 4 {
                    let popularity = u32::from_be_bytes(packet.payload[..4].try_into().unwrap());
                    tracing::debug!(
                        target: "drift::bilibili.ws",
                        popularity,
                        "received popularity update"
                    );
                }
            }
            5 => {
                if let Some(mut msg) = try_extract_live_message(&packet.payload, self_uid) {
                    msg.room_id = Some(room_id);
                    messages.push(msg);
                }
            }
            8 => status_emitter(app, "connected", "认证成功"),
            _ => warn!(
                target: "drift::bilibili.proto",
                operation = packet.operation,
                "unknown bilibili packet operation"
            ),
        }
    }

    Ok(messages)
}

fn try_extract_live_message(payload: &[u8], self_uid: Option<u64>) -> Option<LiveMessage> {
    let value = serde_json::from_slice::<Value>(payload).ok()?;
    let command = value.get("cmd").and_then(Value::as_str)?;
    match command {
        "DANMU_MSG" => {
            emote_probe::maybe_log_danmaku_sample(&value);
            try_extract_danmaku_message(&value, self_uid)
        }
        "SUPER_CHAT_MESSAGE" | "SUPER_CHAT_MESSAGE_JPN" => {
            sc_probe::maybe_log_super_chat_sample(&value);
            try_extract_super_chat_message(&value, self_uid)
        }
        "SEND_GIFT" => try_extract_gift_message(&value),
        "GUARD_BUY" => try_extract_guard_message(&value),
        _ => None,
    }
}

fn empty_live_message(
    id: String,
    kind: LiveMessageKind,
    user: String,
    text: String,
    timestamp: Option<u64>,
) -> LiveMessage {
    LiveMessage {
        id,
        room_id: None,
        kind,
        user,
        text,
        segments: None,
        is_self: false,
        timestamp,
        gift_name: None,
        gift_count: None,
        guard_level: None,
        guard_name: None,
        super_chat_price: None,
        super_chat_duration: None,
        super_chat_color: None,
    }
}

fn try_extract_danmaku_message(value: &Value, self_uid: Option<u64>) -> Option<LiveMessage> {
    let info = value.get("info").and_then(Value::as_array)?;
    let text = info.get(1).and_then(Value::as_str)?;
    let user_info = info.get(2).and_then(Value::as_array)?;

    let uid = user_info.first().and_then(Value::as_u64).unwrap_or(0);
    let user = user_info
        .get(1)
        .and_then(Value::as_str)
        .unwrap_or("匿名用户")
        .to_string();
    let timestamp = info
        .first()
        .and_then(Value::as_array)
        .and_then(|meta| meta.get(4))
        .and_then(Value::as_u64)
        .unwrap_or(0);

    let mut message = empty_live_message(
        format!("{}-{}-{}", uid, timestamp, text.len()),
        LiveMessageKind::Danmaku,
        user,
        text.to_string(),
        Some(timestamp),
    );
    message.is_self = self_uid.is_some_and(|current_uid| current_uid != 0 && current_uid == uid);
    message.segments = extract_danmaku_segments(info, text);
    Some(message)
}

#[derive(Debug, Clone)]
struct ParsedEmote {
    key: String,
    url: String,
    width: Option<u32>,
    height: Option<u32>,
}

fn extract_danmaku_segments(info: &[Value], text: &str) -> Option<Vec<LiveMessageSegment>> {
    let emotes = extract_danmaku_emotes(info);
    if emotes.is_empty() {
        return None;
    }
    build_danmaku_segments(text, &emotes)
}

fn extract_danmaku_emotes(info: &[Value]) -> Vec<ParsedEmote> {
    let Some(extra) = extract_danmaku_extra(info) else {
        return Vec::new();
    };
    let Some(emots) = extra.get("emots").and_then(Value::as_object) else {
        return Vec::new();
    };

    emots
        .iter()
        .filter_map(|(key, value)| parse_emote_entry(key, value))
        .collect()
}

fn extract_danmaku_extra(info: &[Value]) -> Option<Value> {
    let meta = info.first().and_then(Value::as_array)?;
    let container = parse_json_value(meta.get(15)?)?;
    if let Some(extra) = container.get("extra") {
        parse_json_value(extra)
    } else {
        Some(container)
    }
}

fn parse_json_value(value: &Value) -> Option<Value> {
    match value {
        Value::String(text) => serde_json::from_str::<Value>(text.trim()).ok(),
        Value::Object(_) => Some(value.clone()),
        _ => None,
    }
}

fn parse_emote_entry(key: &str, value: &Value) -> Option<ParsedEmote> {
    let key = string_field(value, &["emoji", "text", "content"]).unwrap_or(key);
    if key.trim().is_empty() {
        return None;
    }
    let url = string_field(value, &["url", "emoticon_url", "img_url", "image_url"])
        .and_then(sanitize_emote_url)?;

    Some(ParsedEmote {
        key: key.to_string(),
        url,
        width: u32_field(value, &["width", "w"]),
        height: u32_field(value, &["height", "h"]),
    })
}

fn build_danmaku_segments(text: &str, emotes: &[ParsedEmote]) -> Option<Vec<LiveMessageSegment>> {
    let mut matches = Vec::new();
    for (index, emote) in emotes.iter().enumerate() {
        if emote.key.is_empty() {
            continue;
        }
        for (start, _) in text.match_indices(&emote.key) {
            matches.push((start, start + emote.key.len(), index));
        }
    }

    matches.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| (right.1 - right.0).cmp(&(left.1 - left.0)))
    });

    let mut cursor = 0usize;
    let mut segments = Vec::new();
    let mut has_emote = false;

    for (start, end, emote_index) in matches {
        if start < cursor {
            continue;
        }
        if start > cursor {
            segments.push(text_segment(&text[cursor..start]));
        }

        let emote = &emotes[emote_index];
        segments.push(emote_segment(emote));
        cursor = end;
        has_emote = true;
    }

    if !has_emote {
        return None;
    }
    if cursor < text.len() {
        segments.push(text_segment(&text[cursor..]));
    }
    Some(segments)
}

fn text_segment(text: &str) -> LiveMessageSegment {
    LiveMessageSegment {
        segment_type: LiveMessageSegmentKind::Text,
        text: text.to_string(),
        url: None,
        width: None,
        height: None,
    }
}

fn emote_segment(emote: &ParsedEmote) -> LiveMessageSegment {
    LiveMessageSegment {
        segment_type: LiveMessageSegmentKind::Emote,
        text: emote.key.clone(),
        url: Some(emote.url.clone()),
        width: emote.width,
        height: emote.height,
    }
}

fn sanitize_emote_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    let rest = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))?;
    let authority = rest.split('/').next().unwrap_or_default();
    if authority.is_empty() || authority.contains('@') {
        return None;
    }
    let host = authority
        .split(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !is_allowed_emote_host(&host) {
        return None;
    }
    Some(format!("https://{}", rest))
}

fn is_allowed_emote_host(host: &str) -> bool {
    host == "hdslb.com"
        || host.ends_with(".hdslb.com")
        || host == "bilibili.com"
        || host.ends_with(".bilibili.com")
}

fn try_extract_gift_message(value: &Value) -> Option<LiveMessage> {
    let data = value.get("data")?;
    let user = string_field(data, &["uname", "username"]).unwrap_or("匿名用户");
    let gift_name = string_field(data, &["giftName", "gift_name"]).unwrap_or("礼物");
    let count = u64_field(data, &["num", "gift_num", "count"]).unwrap_or(1);
    let uid = u64_field(data, &["uid"]).unwrap_or(0);
    let timestamp = u64_field(data, &["timestamp", "ts"]);
    let text = format!("{} 送出 {} x{}", user, gift_name, count);
    let mut message = empty_live_message(
        format!(
            "gift-{}-{}-{}-{}",
            uid,
            timestamp.unwrap_or(0),
            gift_name,
            count
        ),
        LiveMessageKind::Gift,
        user.to_string(),
        text,
        timestamp,
    );
    message.gift_name = Some(gift_name.to_string());
    message.gift_count = Some(count);
    Some(message)
}

fn try_extract_guard_message(value: &Value) -> Option<LiveMessage> {
    let data = value.get("data")?;
    let user = string_field(data, &["username", "uname"]).unwrap_or("匿名用户");
    let guard_level = u64_field(data, &["guard_level"])
        .and_then(|level| u8::try_from(level).ok())
        .unwrap_or(3);
    let guard_name = guard_name(guard_level);
    let count = u64_field(data, &["num", "gift_num", "count"]).unwrap_or(1);
    let uid = u64_field(data, &["uid"]).unwrap_or(0);
    let timestamp = u64_field(data, &["timestamp", "start_time"]);
    let text = if count > 1 {
        format!("{} 开通 {} x{}", user, guard_name, count)
    } else {
        format!("{} 开通 {}", user, guard_name)
    };
    let mut message = empty_live_message(
        format!(
            "guard-{}-{}-{}-{}",
            uid,
            timestamp.unwrap_or(0),
            guard_level,
            count
        ),
        LiveMessageKind::Guard,
        user.to_string(),
        text,
        timestamp,
    );
    message.guard_level = Some(guard_level);
    message.guard_name = Some(guard_name.to_string());
    Some(message)
}

fn try_extract_super_chat_message(value: &Value, self_uid: Option<u64>) -> Option<LiveMessage> {
    let data = value.get("data")?;
    let text = string_field(data, &["message", "message_trans"])?;
    let user = string_path(data, &["user_info", "uname"])
        .or_else(|| string_path(data, &["uinfo", "base", "name"]))
        .or_else(|| string_field(data, &["uname", "username"]))
        .unwrap_or("匿名用户");
    let uid = u64_path(data, &["uid"])
        .or_else(|| u64_path(data, &["user_info", "uid"]))
        .or_else(|| u64_path(data, &["uinfo", "uid"]))
        .unwrap_or(0);
    let timestamp = u64_field(data, &["start_time", "ts"]);
    let id = data
        .get("id")
        .and_then(id_component)
        .map(|id| format!("sc-{}", id))
        .unwrap_or_else(|| format!("sc-{}-{}-{}", uid, timestamp.unwrap_or(0), text.len()));

    let mut message = empty_live_message(
        id,
        LiveMessageKind::SuperChat,
        user.to_string(),
        text.to_string(),
        timestamp,
    );
    message.is_self = self_uid.is_some_and(|current_uid| current_uid != 0 && current_uid == uid);
    message.super_chat_price = u64_field(data, &["price", "rmb"]);
    message.super_chat_duration = u64_field(data, &["time"]);
    message.super_chat_color = message
        .super_chat_price
        .and_then(super_chat_color_for_price)
        .map(str::to_string)
        .or_else(|| {
            string_field(
                data,
                &[
                    "background_color",
                    "background_color_start",
                    "background_color_end",
                ],
            )
            .and_then(sanitize_super_chat_color)
        });
    Some(message)
}

fn string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .filter(|value| !value.trim().is_empty())
}

fn string_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    value_at_path(value, path)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
}

fn u64_field(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        let value = value.get(*key)?;
        value
            .as_u64()
            .or_else(|| value.as_str()?.parse::<u64>().ok())
    })
}

fn u64_path(value: &Value, path: &[&str]) -> Option<u64> {
    let value = value_at_path(value, path)?;
    value
        .as_u64()
        .or_else(|| value.as_str()?.parse::<u64>().ok())
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

fn u32_field(value: &Value, keys: &[&str]) -> Option<u32> {
    u64_field(value, keys).and_then(|value| u32::try_from(value).ok())
}

fn sanitize_super_chat_color(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let rest = trimmed.strip_prefix('#')?;
    if rest.len() == 6 && rest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Some(trimmed.to_string())
    } else {
        None
    }
}

fn super_chat_color_for_price(price: u64) -> Option<&'static str> {
    match price {
        1..=29 => Some("#eff6ff"),
        30..=49 => Some("#2a60b3"),
        50..=99 => Some("#437d9e"),
        100..=499 => Some("#e2b52b"),
        500..=999 => Some("#e09544"),
        1000..=1999 => Some("#e54d4d"),
        2000.. => Some("#ab1932"),
        _ => None,
    }
}

fn id_component(value: &Value) -> Option<String> {
    value.as_u64().map(|value| value.to_string()).or_else(|| {
        let text = value.as_str()?.trim();
        let is_safe = !text.is_empty()
            && text.len() <= 64
            && text
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'));
        is_safe.then(|| text.to_string())
    })
}

fn guard_name(level: u8) -> &'static str {
    match level {
        1 => "总督",
        2 => "提督",
        _ => "舰长",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn parse_message(value: Value) -> LiveMessage {
        parse_message_with_self_uid(value, None)
    }

    fn parse_message_with_self_uid(value: Value, self_uid: Option<u64>) -> LiveMessage {
        let bytes = serde_json::to_vec(&value).expect("payload should serialize");
        try_extract_live_message(&bytes, self_uid).expect("message should parse")
    }

    fn danmaku_payload(text: &str, extra_slot: Option<Value>) -> Value {
        let mut meta = vec![
            json!(0),
            json!(1),
            json!(25),
            json!(16777215),
            json!(1710000000_u64),
            json!(0),
            json!(0),
            json!("abc"),
            json!(0),
            json!(0),
            json!(0),
            json!(""),
            json!(0),
            json!("{}"),
            json!("{}"),
        ];
        if let Some(extra_slot) = extra_slot {
            meta.push(extra_slot);
        }

        json!({
            "cmd": "DANMU_MSG",
            "info": [
                meta,
                text,
                [42, "测试用户"],
                []
            ]
        })
    }

    fn extra_slot(extra: Value) -> Value {
        json!({
            "extra": extra.to_string()
        })
        .to_string()
        .into()
    }

    #[test]
    fn extracts_gift_message() {
        let payload = r#"{
            "cmd": "SEND_GIFT",
            "data": {
                "uid": 42,
                "uname": "送礼用户",
                "giftName": "小花花",
                "num": 3,
                "timestamp": 1710000000
            }
        }"#;

        let message =
            try_extract_live_message(payload.as_bytes(), Some(42)).expect("gift should parse");

        assert!(matches!(message.kind, LiveMessageKind::Gift));
        assert_eq!(message.user, "送礼用户");
        assert_eq!(message.text, "送礼用户 送出 小花花 x3");
        assert_eq!(message.gift_name.as_deref(), Some("小花花"));
        assert_eq!(message.gift_count, Some(3));
    }

    #[test]
    fn extracts_guard_message() {
        let payload = r#"{
            "cmd": "GUARD_BUY",
            "data": {
                "uid": 7,
                "username": "上舰用户",
                "guard_level": 3,
                "num": 1,
                "start_time": 1710000001
            }
        }"#;

        let message =
            try_extract_live_message(payload.as_bytes(), Some(7)).expect("guard should parse");

        assert!(matches!(message.kind, LiveMessageKind::Guard));
        assert_eq!(message.user, "上舰用户");
        assert_eq!(message.text, "上舰用户 开通 舰长");
        assert_eq!(message.guard_level, Some(3));
        assert_eq!(message.guard_name.as_deref(), Some("舰长"));
    }

    #[test]
    fn extracts_super_chat_message_from_sample_shape() {
        let payload = r##"{
            "cmd": "SUPER_CHAT_MESSAGE",
            "data": {
                "message": "这是一条醒目留言",
                "message_trans": "",
                "price": 2,
                "time": 5,
                "start_time": 1781273831,
                "end_time": 1781273836,
                "background_color": "#F5A962",
                "uid": 42,
                "user_info": {
                    "uid": 42,
                    "uname": "SC 用户"
                }
            }
        }"##;

        let message = try_extract_live_message(payload.as_bytes(), Some(42))
            .expect("super chat should parse");

        assert!(matches!(message.kind, LiveMessageKind::SuperChat));
        assert_eq!(message.user, "SC 用户");
        assert_eq!(message.text, "这是一条醒目留言");
        assert_eq!(message.timestamp, Some(1781273831));
        assert_eq!(message.super_chat_price, Some(2));
        assert_eq!(message.super_chat_duration, Some(5));
        assert_eq!(message.super_chat_color.as_deref(), Some("#eff6ff"));
        assert!(message.is_self);
    }

    #[test]
    fn extracts_super_chat_with_missing_optional_fields() {
        let payload = r#"{
            "cmd": "SUPER_CHAT_MESSAGE",
            "data": {
                "message": "只有正文也要显示"
            }
        }"#;

        let message =
            try_extract_live_message(payload.as_bytes(), None).expect("super chat should parse");

        assert!(matches!(message.kind, LiveMessageKind::SuperChat));
        assert_eq!(message.user, "匿名用户");
        assert_eq!(message.text, "只有正文也要显示");
        assert_eq!(message.timestamp, None);
        assert_eq!(message.super_chat_price, None);
        assert_eq!(message.super_chat_duration, None);
        assert_eq!(message.super_chat_color, None);
        assert!(!message.is_self);
    }

    #[test]
    fn maps_super_chat_color_from_price_before_payload_color() {
        let payload = r#"{
            "cmd": "SUPER_CHAT_MESSAGE",
            "data": {
                "message": "价格决定颜色",
                "price": 30,
                "background_color": "linear-gradient(secret)"
            }
        }"#;

        let message =
            try_extract_live_message(payload.as_bytes(), None).expect("super chat should parse");

        assert!(matches!(message.kind, LiveMessageKind::SuperChat));
        assert_eq!(message.text, "价格决定颜色");
        assert_eq!(message.super_chat_price, Some(30));
        assert_eq!(message.super_chat_color.as_deref(), Some("#2a60b3"));
    }

    #[test]
    fn maps_super_chat_color_price_boundaries() {
        let cases = [
            (0, None),
            (1, Some("#eff6ff")),
            (29, Some("#eff6ff")),
            (30, Some("#2a60b3")),
            (49, Some("#2a60b3")),
            (50, Some("#437d9e")),
            (99, Some("#437d9e")),
            (100, Some("#e2b52b")),
            (499, Some("#e2b52b")),
            (500, Some("#e09544")),
            (999, Some("#e09544")),
            (1000, Some("#e54d4d")),
            (1999, Some("#e54d4d")),
            (2000, Some("#ab1932")),
        ];

        for (price, expected_color) in cases {
            assert_eq!(super_chat_color_for_price(price), expected_color);
        }
    }

    #[test]
    fn plain_danmaku_has_no_segments() {
        let message = parse_message(danmaku_payload("普通弹幕", None));

        assert!(matches!(message.kind, LiveMessageKind::Danmaku));
        assert_eq!(message.user, "测试用户");
        assert_eq!(message.text, "普通弹幕");
        assert!(message.segments.is_none());
        assert!(!message.is_self);
    }

    #[test]
    fn marks_self_danmaku_when_sender_uid_matches_authenticated_uid() {
        let message = parse_message_with_self_uid(danmaku_payload("自己的弹幕", None), Some(42));

        assert!(message.is_self);
    }

    #[test]
    fn does_not_mark_self_danmaku_when_sender_uid_differs() {
        let message = parse_message_with_self_uid(danmaku_payload("别人的弹幕", None), Some(7));

        assert!(!message.is_self);
    }

    #[test]
    fn does_not_mark_self_danmaku_without_authenticated_uid() {
        let message = parse_message_with_self_uid(danmaku_payload("匿名连接弹幕", None), None);

        assert!(!message.is_self);
    }

    #[test]
    fn extracts_single_emote_segment() {
        let message = parse_message(danmaku_payload(
            "[妙]",
            Some(extra_slot(json!({
                "dm_type": 0,
                "content": "[妙]",
                "emots": {
                    "[妙]": {
                        "emoji": "[妙]",
                        "url": "http://i0.hdslb.com/bfs/live/miao.png",
                        "width": 20,
                        "height": 20
                    }
                }
            }))),
        ));

        let segments = message.segments.expect("emote segments");
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].segment_type, LiveMessageSegmentKind::Emote);
        assert_eq!(segments[0].text, "[妙]");
        assert_eq!(
            segments[0].url.as_deref(),
            Some("https://i0.hdslb.com/bfs/live/miao.png")
        );
        assert_eq!(segments[0].width, Some(20));
        assert_eq!(segments[0].height, Some(20));
    }

    #[test]
    fn extracts_mixed_text_and_emote_segments() {
        let message = parse_message(danmaku_payload(
            "前缀[妙]后缀",
            Some(extra_slot(json!({
                "dm_type": 0,
                "content": "前缀[妙]后缀",
                "emots": {
                    "[妙]": {
                        "emoji": "[妙]",
                        "url": "https://i0.hdslb.com/bfs/live/miao.png",
                        "width": 20,
                        "height": 20
                    }
                }
            }))),
        ));

        let segments = message.segments.expect("emote segments");
        assert_eq!(segments.len(), 3);
        assert_eq!(segments[0].segment_type, LiveMessageSegmentKind::Text);
        assert_eq!(segments[0].text, "前缀");
        assert_eq!(segments[1].segment_type, LiveMessageSegmentKind::Emote);
        assert_eq!(segments[1].text, "[妙]");
        assert_eq!(segments[2].segment_type, LiveMessageSegmentKind::Text);
        assert_eq!(segments[2].text, "后缀");
    }

    #[test]
    fn invalid_emote_url_falls_back_to_plain_text() {
        let message = parse_message(danmaku_payload(
            "[妙]",
            Some(extra_slot(json!({
                "dm_type": 0,
                "content": "[妙]",
                "emots": {
                    "[妙]": {
                        "emoji": "[妙]",
                        "url": "https://evil.example/bfs/live/miao.png",
                        "width": 20,
                        "height": 20
                    }
                }
            }))),
        ));

        assert_eq!(message.text, "[妙]");
        assert!(message.segments.is_none());
    }

    #[test]
    fn malformed_emote_extra_falls_back_to_plain_text() {
        let message = parse_message(danmaku_payload("[妙]", Some(json!("not-json"))));

        assert_eq!(message.text, "[妙]");
        assert!(message.segments.is_none());
    }
}
