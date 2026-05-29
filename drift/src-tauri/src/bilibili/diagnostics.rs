use super::auth;
use super::cookies::merge_cookie_headers;
use super::http;
use super::protocol;
use super::types::{compact_token, elapsed_ms, param_value, ApiTestStep, DanmuInfo, DeviceCookie};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::future::Future;
use std::time::{Duration, Instant};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tracing::debug;

#[derive(Debug, Clone)]
struct DiagnosticRequestIdentity {
    uid: u64,
    cookie: String,
    is_authenticated: bool,
}

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

    let mut request_identity = diagnostic_request_identity(&device);
    steps.push(ApiTestStep {
        key: "request_identity".to_string(),
        label: "请求身份".to_string(),
        status: "success".to_string(),
        duration_ms: 0,
        message: if request_identity.is_authenticated {
            "使用登录态请求链路".to_string()
        } else {
            "使用匿名请求链路".to_string()
        },
        detail: if request_identity.is_authenticated {
            format!("uid={} cookie=登录态+设备指纹", request_identity.uid)
        } else {
            "uid=0 cookie=设备指纹".to_string()
        },
    });

    let Some(mixin_key) = run_wbi_nav_test_step(&mut steps, &device, &mut request_identity).await
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
            let data = match http::fetch_danmu_info_with_params(
                room_init.room_id,
                &request_identity.cookie,
                &wbi_params,
            )
            .await
            {
                Ok(data) => data,
                Err(error) if request_identity.is_authenticated => {
                    request_identity = diagnostic_anonymous_identity(&device);
                    http::fetch_danmu_info(room_init.room_id, &request_identity.cookie)
                        .await
                        .map_err(|anonymous_error| {
                            format!(
                                "登录态 getDanmuInfo 失败：{}；匿名重试失败：{}",
                                error, anonymous_error
                            )
                        })?
                }
                Err(error) => return Err(error),
            };
            let host = data
                .host_list
                .first()
                .ok_or_else(|| "B 站没有返回弹幕服务器地址".to_string())?;
            let detail = format!(
                "identity={} host={} wss_port={} token={}",
                if request_identity.is_authenticated {
                    "authenticated"
                } else {
                    "anonymous"
                },
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

    run_anchor_name_test_step(
        &mut steps,
        room_init.room_id,
        room_init.uid,
        &request_identity.cookie,
    )
    .await;

    run_api_test_step(
        &mut steps,
        "websocket_auth",
        "WebSocket 鉴权",
        true,
        async {
            let detail = test_websocket_auth(
                room_init.room_id,
                &device,
                &danmu_info,
                request_identity.uid,
            )
            .await?;
            Ok(((), "WebSocket 认证成功".to_string(), detail))
        },
    )
    .await;

    Ok(steps)
}

fn diagnostic_request_identity(device: &DeviceCookie) -> DiagnosticRequestIdentity {
    match auth::load_auth_request_context() {
        Ok(Some(context)) => DiagnosticRequestIdentity {
            uid: context.uid,
            cookie: merge_cookie_headers(&context.cookie_header, &device.cookie),
            is_authenticated: true,
        },
        Ok(None) | Err(_) => diagnostic_anonymous_identity(device),
    }
}

fn diagnostic_anonymous_identity(device: &DeviceCookie) -> DiagnosticRequestIdentity {
    DiagnosticRequestIdentity {
        uid: 0,
        cookie: device.cookie.clone(),
        is_authenticated: false,
    }
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

async fn run_wbi_nav_test_step(
    steps: &mut Vec<ApiTestStep>,
    device: &DeviceCookie,
    request_identity: &mut DiagnosticRequestIdentity,
) -> Option<String> {
    let started_at = Instant::now();
    match http::fetch_wbi_mixin_key(&request_identity.cookie).await {
        Ok(mixin_key) => {
            steps.push(ApiTestStep {
                key: "wbi_nav".to_string(),
                label: "WBI key".to_string(),
                status: "success".to_string(),
                duration_ms: elapsed_ms(started_at),
                message: "nav 正常".to_string(),
                detail: format!(
                    "mixin_key={} len={}",
                    compact_token(&mixin_key),
                    mixin_key.len()
                ),
            });
            return Some(mixin_key);
        }
        Err(error) if request_identity.is_authenticated => {
            steps.push(ApiTestStep {
                key: "wbi_nav_auth".to_string(),
                label: "WBI key（登录态）".to_string(),
                status: "warning".to_string(),
                duration_ms: elapsed_ms(started_at),
                message: "登录态 nav 异常，尝试匿名回退".to_string(),
                detail: error,
            });
            *request_identity = diagnostic_anonymous_identity(device);
        }
        Err(error) => {
            steps.push(ApiTestStep {
                key: "wbi_nav".to_string(),
                label: "WBI key".to_string(),
                status: "failed".to_string(),
                duration_ms: elapsed_ms(started_at),
                message: "关键步骤失败".to_string(),
                detail: error,
            });
            return None;
        }
    }

    let started_at = Instant::now();
    match http::fetch_wbi_mixin_key(&request_identity.cookie).await {
        Ok(mixin_key) => {
            steps.push(ApiTestStep {
                key: "wbi_nav".to_string(),
                label: "WBI key".to_string(),
                status: "success".to_string(),
                duration_ms: elapsed_ms(started_at),
                message: "匿名 nav 回退正常".to_string(),
                detail: format!(
                    "mixin_key={} len={}",
                    compact_token(&mixin_key),
                    mixin_key.len()
                ),
            });
            Some(mixin_key)
        }
        Err(error) => {
            steps.push(ApiTestStep {
                key: "wbi_nav".to_string(),
                label: "WBI key".to_string(),
                status: "failed".to_string(),
                duration_ms: elapsed_ms(started_at),
                message: "关键步骤失败".to_string(),
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
    uid: u64,
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
        "uid": uid,
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
        "uid={} host={} wss_port={} 认证成功",
        uid, host.host, host.wss_port
    ))
}
