use super::http;
use super::protocol;
use super::types::{
    compact_token, elapsed_ms, param_value, ApiTestStep, DeviceCookie, DanmuInfo, DanmuHost,
};
use std::future::Future;
use std::time::{Duration, Instant};
use serde_json::json;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use futures_util::StreamExt;
use tracing::debug;

#[tauri::command]
pub async fn test_bilibili_api(room_id: u64) -> Result<Vec<ApiTestStep>, String> {
    if room_id == 0 {
        return Err("请输入有效的直播间房间号".to_string());
    }

    let mut steps = Vec::new();

    let Some(room_init) = run_api_test_step(&mut steps, "room_init", "真实房间号", true, async {
        let data = http::fetch_room_init(room_id).await?;
        let detail = format!(
            "room_id={} uid={} live_status={}",
            data.room_id, data.uid, data.live_status
        );
        Ok((data, "room_init 正常".to_string(), detail))
    })
    .await
    else {
        return Ok(steps);
    };

    let Some(device) = run_api_test_step(&mut steps, "finger_spi", "匿名设备指纹", true, async {
        let data = http::fetch_buvid().await?;
        let detail = format!("buvid3={} cookie 已生成", compact_token(&data.buvid3));
        Ok((data, "finger/spi 正常".to_string(), detail))
    })
    .await
    else {
        return Ok(steps);
    };

    let Some(mixin_key) = run_api_test_step(&mut steps, "wbi_nav", "WBI key", true, async {
        let data = http::fetch_wbi_mixin_key(&device.cookie).await?;
        let detail = format!("mixin_key={} len={}", compact_token(&data), data.len());
        Ok((data, "nav 正常".to_string(), detail))
    })
    .await
    else {
        return Ok(steps);
    };

    let Some(wbi_params) = run_api_test_step(&mut steps, "wbi_sign", "WBI 签名", true, async {
        let params = http::build_wbi_params_with_mixin_key(room_init.room_id, &mixin_key)?;
        let wts = param_value(&params, "wts").unwrap_or_default();
        let w_rid = param_value(&params, "w_rid").unwrap_or_default();
        let detail = format!("wts={} w_rid={}", wts, compact_token(&w_rid));
        Ok((params, "WBI 参数已生成".to_string(), detail))
    })
    .await
    else {
        return Ok(steps);
    };

    let Some(danmu_info) = run_api_test_step(
        &mut steps,
        "get_danmu_info",
        "弹幕服务器信息",
        true,
        async {
            let data = http::fetch_danmu_info_with_params(room_init.room_id, &device.cookie, &wbi_params)
                .await?;
            let host = data
                .host_list
                .first()
                .ok_or_else(|| "B 站没有返回弹幕服务器地址".to_string())?;
            let detail = format!(
                "host={} wss_port={} token={}",
                host.host,
                host.wss_port,
                compact_token(&data.token)
            );
            Ok((data, "getDanmuInfo 正常".to_string(), detail))
        },
    )
    .await
    else {
        return Ok(steps);
    };

    run_anchor_name_test_step(&mut steps, room_init.room_id, room_init.uid, &device.cookie).await;

    run_api_test_step(
        &mut steps,
        "websocket_auth",
        "WebSocket 鉴权",
        true,
        async {
            let detail = test_websocket_auth(room_init.room_id, &device, &danmu_info).await?;
            Ok(((), "WebSocket 认证成功".to_string(), detail))
        },
    )
    .await;

    Ok(steps)
}

async fn run_api_test_step<T, Fut>(
    steps: &mut Vec<ApiTestStep>,
    key: &str,
    label: &str,
    critical: bool,
    future: Fut,
) -> Option<T>
where
    Fut: Future<Output = Result<(T, String, String), String>>,
{
    let started_at = Instant::now();
    match future.await {
        Ok((value, message, detail)) => {
            steps.push(ApiTestStep {
                key: key.to_string(),
                label: label.to_string(),
                status: "success".to_string(),
                duration_ms: elapsed_ms(started_at),
                message,
                detail,
            });
            Some(value)
        }
        Err(error) => {
            steps.push(ApiTestStep {
                key: key.to_string(),
                label: label.to_string(),
                status: if critical { "failed" } else { "warning" }.to_string(),
                duration_ms: elapsed_ms(started_at),
                message: if critical {
                    "关键步骤失败".to_string()
                } else {
                    "非关键步骤异常".to_string()
                },
                detail: error,
            });
            None
        }
    }
}

async fn run_anchor_name_test_step(
    steps: &mut Vec<ApiTestStep>,
    room_id: u64,
    uid: u64,
    cookie: &str,
) {
    let started_at = Instant::now();
    let result = if let Some(anchor_name) = super::types::cached_anchor_name(uid) {
        Ok((
            "success",
            "主播名缓存命中".to_string(),
            format!("anchor_name={}", anchor_name),
        ))
    } else {
        match http::fetch_room_base_anchor_name(room_id, uid, cookie).await {
            Ok(anchor_name) => {
                super::types::cache_anchor_name(uid, &anchor_name);
                Ok((
                    "success",
                    "getRoomBaseInfo 正常".to_string(),
                    format!("anchor_name={}", anchor_name),
                ))
            }
            Err(room_base_error) => match http::fetch_anchor_name(uid, cookie).await {
                Ok(anchor_name) => {
                    super::types::cache_anchor_name(uid, &anchor_name);
                    Ok((
                        "warning",
                        "space/acc/info 兜底成功".to_string(),
                        format!(
                            "anchor_name={}；getRoomBaseInfo 失败：{}",
                            anchor_name, room_base_error
                        ),
                    ))
                }
                Err(profile_error) => match http::fetch_room_info(room_id, cookie).await {
                    Ok(room_info) => {
                        let anchor_name = room_info.anchor_info.base_info.uname;
                        super::types::cache_anchor_name(uid, &anchor_name);
                        Ok((
                            "warning",
                            "getInfoByRoom 兜底成功".to_string(),
                            format!(
                                "anchor_name={}；getRoomBaseInfo 失败：{}；space/acc/info 失败：{}",
                                anchor_name, room_base_error, profile_error
                            ),
                        ))
                    }
                    Err(room_info_error) => Err(format!(
                        "getRoomBaseInfo 失败：{}；space/acc/info 失败：{}；getInfoByRoom 失败：{}",
                        room_base_error, profile_error, room_info_error
                    )),
                },
            },
        }
    };

    match result {
        Ok((status, message, detail)) => steps.push(ApiTestStep {
            key: "anchor_name".to_string(),
            label: "主播名称".to_string(),
            status: status.to_string(),
            duration_ms: elapsed_ms(started_at),
            message,
            detail,
        }),
        Err(error) => steps.push(ApiTestStep {
            key: "anchor_name".to_string(),
            label: "主播名称".to_string(),
            status: "warning".to_string(),
            duration_ms: elapsed_ms(started_at),
            message: "主播名称获取失败，不影响弹幕连接".to_string(),
            detail: error,
        }),
    }
}

async fn test_websocket_auth(
    room_id: u64,
    device: &DeviceCookie,
    danmu_info: &DanmuInfo,
) -> Result<String, String> {
    let host = danmu_info
        .host_list
        .first()
        .ok_or_else(|| "B 站没有返回弹幕服务器地址".to_string())?;
    let url = format!("wss://{}:{}/sub", host.host, host.wss_port);
    let (socket, _) = connect_async(&url)
        .await
        .map_err(|error| format!("WebSocket 连接失败：{}", error))?;
    let (mut writer, mut reader) = socket.split();

    let auth_body = json!({
        "uid": 0,
        "roomid": room_id,
        "protover": 2,
        "buvid": device.buvid3,
        "platform": "web",
        "type": 2,
        "key": danmu_info.token,
    });
    writer
        .send(Message::Binary(
            protocol::build_packet(7, 1, auth_body.to_string().as_bytes()).into(),
        ))
        .await
        .map_err(|error| format!("认证包发送失败：{}", error))?;

    let authenticated = tokio::time::timeout(Duration::from_secs(6), async {
        while let Some(message) = reader.next().await {
            match message {
                Ok(Message::Binary(bytes)) => {
                    for packet in protocol::unpack_packets(&bytes)? {
                        if packet.operation == 8 {
                            return Ok(());
                        }
                    }
                }
                Ok(Message::Close(_)) => return Err("服务器关闭连接".to_string()),
                Ok(_) => {}
                Err(error) => return Err(format!("WebSocket 读取失败：{}", error)),
            }
        }
        Err("WebSocket 连接结束".to_string())
    })
    .await
    .map_err(|_| "等待认证响应超时".to_string())?;

    authenticated?;
    if let Err(error) = writer.close().await {
        debug!(target: "drift::bilibili.ws", error = %error, "websocket test close failed");
    }

    Ok(format!(
        "host={} wss_port={} 认证成功",
        host.host, host.wss_port
    ))
}
