use super::types::{DanmakuMessage, Packet, HEADER_SIZE};
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
    bytes: &[u8],
) -> Result<Vec<DanmakuMessage>, String> {
    let packets = unpack_packets(bytes)?;
    let mut messages = Vec::new();

    for packet in packets {
        match packet.operation {
            3 => {
                if packet.payload.len() >= 4 {
                    let popularity =
                        u32::from_be_bytes(packet.payload[..4].try_into().unwrap());
                    tracing::debug!(
                        target: "drift::bilibili.ws",
                        popularity,
                        "received popularity update"
                    );
                }
            }
            5 => {
                if let Some(msg) = try_extract_danmaku_message(&packet.payload) {
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

fn try_extract_danmaku_message(payload: &[u8]) -> Option<DanmakuMessage> {
    let value = serde_json::from_slice::<Value>(payload).ok()?;
    let command = value.get("cmd").and_then(Value::as_str)?;
    if command != "DANMU_MSG" {
        return None;
    }

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

    Some(DanmakuMessage {
        id: format!("{}-{}-{}", uid, timestamp, text.len()),
        user,
        text: text.to_string(),
    })
}
