use super::cookies::{parse_set_cookie_headers, BilibiliCookieBundle};
use super::session;
use super::types::{ApiResponse, BROWSER_USER_AGENT, NAV_URL};
use crate::app_config::{self, AuthConfig};
use reqwest::header::{ACCEPT, REFERER, SET_COOKIE, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tracing::{info, warn};

const QR_GENERATE_URL: &str = "https://passport.bilibili.com/x/passport-login/web/qrcode/generate";
const QR_POLL_URL: &str = "https://passport.bilibili.com/x/passport-login/web/qrcode/poll";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub is_logged_in: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uid: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_validated_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub needs_relogin: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrLoginSession {
    pub url: String,
    pub qrcode_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrLoginPollResult {
    pub code: i32,
    pub status: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_status: Option<AuthStatus>,
}

#[derive(Debug, Clone)]
pub(crate) struct AuthRequestContext {
    pub(crate) uid: u64,
    pub(crate) cookie_header: String,
}

#[derive(Debug, Deserialize)]
struct QrGenerateData {
    url: String,
    qrcode_key: String,
}

#[derive(Debug, Deserialize)]
struct QrPollData {
    url: String,
    refresh_token: String,
    #[serde(rename = "timestamp")]
    _timestamp: i64,
    code: i32,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NavAuthData {
    is_login: bool,
    mid: Option<u64>,
    uname: Option<String>,
}

impl AuthStatus {
    fn logged_out() -> Self {
        Self {
            is_logged_in: false,
            uid: None,
            username: None,
            expires_at: None,
            last_validated_at: None,
            needs_relogin: None,
            error: None,
        }
    }

    fn error(message: String) -> Self {
        Self {
            is_logged_in: false,
            uid: None,
            username: None,
            expires_at: None,
            last_validated_at: Some(now_unix()),
            needs_relogin: Some(true),
            error: Some(message),
        }
    }
}

#[tauri::command]
pub fn auth_get_status(app: AppHandle) -> Result<AuthStatus, String> {
    match session::load_cookie_bundle() {
        Ok(Some(bundle)) => {
            let now = now_unix();
            let expired = session::is_expired(bundle.expires_at, now);
            let config = app_config::read_app_config(&app).ok();
            Ok(AuthStatus {
                is_logged_in: !expired,
                uid: bundle.uid(),
                username: config.and_then(|config| config.auth.last_login_name),
                expires_at: bundle.expires_at,
                last_validated_at: app_config::read_app_config(&app)
                    .ok()
                    .and_then(|config| config.auth.last_validated_at),
                needs_relogin: Some(expired),
                error: if expired {
                    Some("登录凭据已过期，请重新扫码登录".to_string())
                } else {
                    None
                },
            })
        }
        Ok(None) => Ok(AuthStatus::logged_out()),
        Err(error) => {
            warn!(
                target: "drift::bilibili.auth",
                error = %error,
                "failed to read bilibili auth status"
            );
            Ok(AuthStatus::error(
                "登录状态读取失败，请重新登录".to_string(),
            ))
        }
    }
}

#[tauri::command]
pub async fn auth_start_qr_login() -> Result<QrLoginSession, String> {
    let response = reqwest::Client::new()
        .get(QR_GENERATE_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com/")
        .send()
        .await
        .map_err(|error| format!("二维码生成请求失败：{}", error))?;

    let status = response.status();
    let body = response
        .bytes()
        .await
        .map_err(|error| format!("二维码生成响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!("二维码生成 HTTP {}", status));
    }

    let payload = serde_json::from_slice::<ApiResponse<QrGenerateData>>(&body)
        .map_err(|error| format!("二维码生成响应解析失败：{}", error))?;

    if payload.code != 0 {
        return Err(format!(
            "二维码生成返回错误：{} {}",
            payload.code, payload.message
        ));
    }

    let data = payload
        .data
        .ok_or_else(|| "二维码生成响应缺少 data 字段".to_string())?;

    info!(target: "drift::bilibili.auth", "qr login session generated");
    Ok(QrLoginSession {
        url: data.url,
        qrcode_key: data.qrcode_key,
    })
}

#[tauri::command]
pub async fn auth_poll_qr_login(
    app: AppHandle,
    qrcode_key: String,
) -> Result<QrLoginPollResult, String> {
    if qrcode_key.trim().is_empty() {
        return Err("二维码 key 不能为空".to_string());
    }

    let response = reqwest::Client::new()
        .get(QR_POLL_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com/")
        .query(&[("qrcode_key", qrcode_key)])
        .send()
        .await
        .map_err(|error| format!("二维码登录轮询请求失败：{}", error))?;

    let status = response.status();
    let set_cookie_headers = response
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok().map(ToString::to_string))
        .collect::<Vec<_>>();
    let body = response
        .bytes()
        .await
        .map_err(|error| format!("二维码登录轮询响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!("二维码登录轮询 HTTP {}", status));
    }

    let payload = serde_json::from_slice::<ApiResponse<QrPollData>>(&body)
        .map_err(|error| format!("二维码登录轮询响应解析失败：{}", error))?;

    if payload.code != 0 {
        return Err(format!(
            "二维码登录轮询返回错误：{} {}",
            payload.code, payload.message
        ));
    }

    let data = payload
        .data
        .ok_or_else(|| "二维码登录轮询响应缺少 data 字段".to_string())?;
    let status_text = qr_status(data.code).to_string();
    info!(
        target: "drift::bilibili.auth",
        qr_code = data.code,
        status = %status_text,
        "qr login poll result"
    );

    if data.code != 0 {
        return Ok(QrLoginPollResult {
            code: data.code,
            status: status_text,
            message: qr_message(data.code, &data.message),
            auth_status: None,
        });
    }

    let expires_at = extract_query_param(&data.url, "Expires").and_then(|value| value.parse().ok());
    let bundle = parse_set_cookie_headers(
        set_cookie_headers,
        non_empty(data.refresh_token),
        expires_at,
    )?;
    let auth_status = validate_cookie_bundle(&bundle).await?;
    session::save_cookie_bundle(&bundle)?;
    persist_auth_status(&app, &auth_status)?;

    Ok(QrLoginPollResult {
        code: data.code,
        status: status_text,
        message: "登录成功".to_string(),
        auth_status: Some(auth_status),
    })
}

#[tauri::command]
pub async fn auth_validate_session(app: AppHandle) -> Result<AuthStatus, String> {
    let Some(bundle) = session::load_cookie_bundle()? else {
        let status = AuthStatus::logged_out();
        persist_auth_status(&app, &status)?;
        return Ok(status);
    };

    if session::is_expired(bundle.expires_at, now_unix()) {
        let status = AuthStatus {
            is_logged_in: false,
            uid: bundle.uid(),
            username: None,
            expires_at: bundle.expires_at,
            last_validated_at: Some(now_unix()),
            needs_relogin: Some(true),
            error: Some("登录凭据已过期，请重新扫码登录".to_string()),
        };
        persist_auth_status(&app, &status)?;
        return Ok(status);
    }

    match validate_cookie_bundle(&bundle).await {
        Ok(status) => {
            persist_auth_status(&app, &status)?;
            Ok(status)
        }
        Err(error) => {
            warn!(
                target: "drift::bilibili.auth",
                error = %error,
                "bilibili auth validation failed"
            );
            let status = AuthStatus {
                is_logged_in: false,
                uid: bundle.uid(),
                username: None,
                expires_at: bundle.expires_at,
                last_validated_at: Some(now_unix()),
                needs_relogin: Some(true),
                error: Some("登录状态校验失败，请重新登录".to_string()),
            };
            persist_auth_status(&app, &status)?;
            Ok(status)
        }
    }
}

#[tauri::command]
pub fn auth_logout(app: AppHandle) -> Result<AuthStatus, String> {
    session::delete_cookie_bundle()?;
    let status = AuthStatus::logged_out();
    persist_auth_status(&app, &status)?;
    info!(target: "drift::bilibili.auth", "bilibili auth credentials cleared");
    Ok(status)
}

pub(crate) fn load_auth_request_context() -> Result<Option<AuthRequestContext>, String> {
    let Some(bundle) = session::load_cookie_bundle()? else {
        return Ok(None);
    };

    if session::is_expired(bundle.expires_at, now_unix()) {
        warn!(
            target: "drift::bilibili.auth",
            "stored bilibili auth cookie is expired; using anonymous request context"
        );
        return Ok(None);
    }

    let Some(uid) = bundle.uid() else {
        warn!(
            target: "drift::bilibili.auth",
            "stored bilibili auth cookie has invalid uid; using anonymous request context"
        );
        return Ok(None);
    };

    Ok(Some(AuthRequestContext {
        uid,
        cookie_header: bundle.cookie_header(),
    }))
}

pub(crate) fn diagnostic_lines(app: &AppHandle) -> Vec<String> {
    match session::load_cookie_bundle() {
        Ok(Some(bundle)) => {
            let expired = session::is_expired(bundle.expires_at, now_unix());
            let config = app_config::read_app_config(app).ok();
            vec![
                format!("auth.cookie_present=true"),
                format!("auth.is_logged_in={}", !expired),
                format!(
                    "auth.uid={}",
                    bundle.uid().map_or("".to_string(), |uid| uid.to_string())
                ),
                format!(
                    "auth.username={}",
                    config
                        .and_then(|config| config.auth.last_login_name)
                        .unwrap_or_default()
                ),
                format!(
                    "auth.expires_at={}",
                    bundle
                        .expires_at
                        .map_or("".to_string(), |expires_at| expires_at.to_string())
                ),
                format!("auth.needs_relogin={}", expired),
                format!("auth.cookie_redacted={}", bundle.redacted_cookie_header()),
            ]
        }
        Ok(None) => vec![
            "auth.cookie_present=false".to_string(),
            "auth.is_logged_in=false".to_string(),
        ],
        Err(error) => vec![
            "auth.cookie_present=unknown".to_string(),
            "auth.is_logged_in=false".to_string(),
            format!("auth.error={}", error),
        ],
    }
}

async fn validate_cookie_bundle(bundle: &BilibiliCookieBundle) -> Result<AuthStatus, String> {
    let response = reqwest::Client::new()
        .get(NAV_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com/")
        .header("Cookie", bundle.cookie_header())
        .send()
        .await
        .map_err(|error| format!("登录状态校验请求失败：{}", error))?;

    let status = response.status();
    let body = response
        .bytes()
        .await
        .map_err(|error| format!("登录状态校验响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!("登录状态校验 HTTP {}", status));
    }

    let payload = serde_json::from_slice::<ApiResponse<NavAuthData>>(&body)
        .map_err(|error| format!("登录状态校验响应解析失败：{}", error))?;

    if payload.code != 0 {
        return Err(format!(
            "登录状态校验返回错误：{} {}",
            payload.code, payload.message
        ));
    }

    let data = payload
        .data
        .ok_or_else(|| "登录状态校验响应缺少 data 字段".to_string())?;

    if !data.is_login {
        return Err("B 站返回未登录状态".to_string());
    }

    Ok(AuthStatus {
        is_logged_in: true,
        uid: data.mid.or_else(|| bundle.uid()),
        username: data.uname,
        expires_at: bundle.expires_at,
        last_validated_at: Some(now_unix()),
        needs_relogin: Some(false),
        error: None,
    })
}

fn persist_auth_status(app: &AppHandle, status: &AuthStatus) -> Result<(), String> {
    app_config::update_auth_config(
        app,
        AuthConfig {
            enabled: status.is_logged_in,
            last_login_uid: status.uid,
            last_login_name: status.username.clone(),
            last_validated_at: status.last_validated_at,
        },
    )?;
    Ok(())
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn qr_status(code: i32) -> &'static str {
    match code {
        0 => "confirmed",
        86101 => "waiting",
        86090 => "scanned",
        86038 => "expired",
        _ => "error",
    }
}

fn qr_message(code: i32, fallback: &str) -> String {
    match code {
        86101 => "未扫码".to_string(),
        86090 => "已扫码，等待手机确认".to_string(),
        86038 => "二维码已过期".to_string(),
        0 => "登录成功".to_string(),
        _ if !fallback.trim().is_empty() => fallback.to_string(),
        _ => format!("未知扫码状态：{}", code),
    }
}

fn non_empty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn extract_query_param(url: &str, key: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    for pair in query.split('&') {
        let (name, value) = pair.split_once('=')?;
        if name == key {
            return Some(value.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_qr_status_codes() {
        assert_eq!(qr_status(0), "confirmed");
        assert_eq!(qr_status(86101), "waiting");
        assert_eq!(qr_status(86090), "scanned");
        assert_eq!(qr_status(86038), "expired");
        assert_eq!(qr_status(1), "error");
    }

    #[test]
    fn extracts_expires_from_login_success_url() {
        let url = "https://passport.biligame.com/x/passport-login/web/crossDomain?DedeUserID=1&Expires=1795612681&gourl=https%3A%2F%2Fwww.bilibili.com";
        assert_eq!(
            extract_query_param(url, "Expires").as_deref(),
            Some("1795612681")
        );
    }
}
