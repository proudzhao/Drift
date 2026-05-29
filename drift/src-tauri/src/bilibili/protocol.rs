use super::types::{LiveMessage, LiveMessageKind, Packet, HEADER_SIZE};
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
                if let Some(mut msg) = try_extract_live_message(&packet.payload) {
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

fn try_extract_live_message(payload: &[u8]) -> Option<LiveMessage> {
    let value = serde_json::from_slice::<Value>(payload).ok()?;
    let command = value.get("cmd").and_then(Value::as_str)?;
    match command {
        "DANMU_MSG" => try_extract_danmaku_message(&value),
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
        timestamp,
        gift_name: None,
        gift_count: None,
        guard_level: None,
        guard_name: None,
    }
}

fn try_extract_danmaku_message(value: &Value) -> Option<LiveMessage> {
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

    Some(empty_live_message(
        format!("{}-{}-{}", uid, timestamp, text.len()),
        LiveMessageKind::Danmaku,
        user,
        text.to_string(),
        Some(timestamp),
    ))
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

fn string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
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

        let message = try_extract_live_message(payload.as_bytes()).expect("gift should parse");

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

        let message = try_extract_live_message(payload.as_bytes()).expect("guard should parse");

        assert!(matches!(message.kind, LiveMessageKind::Guard));
        assert_eq!(message.user, "上舰用户");
        assert_eq!(message.text, "上舰用户 开通 舰长");
        assert_eq!(message.guard_level, Some(3));
        assert_eq!(message.guard_name.as_deref(), Some("舰长"));
    }
}
