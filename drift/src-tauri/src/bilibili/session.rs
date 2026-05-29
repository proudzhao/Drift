#![allow(dead_code)]

use super::cookies::BilibiliCookieBundle;
use keyring::{Entry, Error as KeyringError};

const SECRET_SERVICE: &str = "com.proudzhao.drift.bilibili.auth";
const SECRET_ACCOUNT: &str = "bilibili-cookie-bundle";

pub(crate) fn load_cookie_bundle() -> Result<Option<BilibiliCookieBundle>, String> {
    let Some(secret) = read_secret()? else {
        return Ok(None);
    };
    let bundle = serde_json::from_str::<BilibiliCookieBundle>(&secret)
        .map_err(|error| format!("登录凭据解析失败：{}", error))?;
    Ok(Some(bundle))
}

pub(crate) fn save_cookie_bundle(bundle: &BilibiliCookieBundle) -> Result<(), String> {
    let secret = serde_json::to_string(bundle).map_err(|error| error.to_string())?;
    write_secret(&secret)
}

pub(crate) fn delete_cookie_bundle() -> Result<(), String> {
    delete_secret()
}

pub(crate) fn is_expired(expires_at: Option<i64>, now: i64) -> bool {
    expires_at.is_some_and(|expires_at| expires_at <= now)
}

fn read_secret() -> Result<Option<String>, String> {
    match credential()?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "读取系统凭据失败：{}",
            sanitize_keyring_error(error)
        )),
    }
}

fn write_secret(secret: &str) -> Result<(), String> {
    credential()?
        .set_password(secret)
        .map_err(|error| format!("写入系统凭据失败：{}", sanitize_keyring_error(error)))
}

fn delete_secret() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "删除系统凭据失败：{}",
            sanitize_keyring_error(error)
        )),
    }
}

fn credential() -> Result<Entry, String> {
    Entry::new(SECRET_SERVICE, SECRET_ACCOUNT)
        .map_err(|error| format!("初始化系统凭据失败：{}", sanitize_keyring_error(error)))
}

fn sanitize_keyring_error(error: KeyringError) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_expired_bundle() {
        assert!(is_expired(Some(10), 10));
        assert!(is_expired(Some(9), 10));
        assert!(!is_expired(Some(11), 10));
        assert!(!is_expired(None, 10));
    }
}
