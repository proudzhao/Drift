#![allow(dead_code)]

use super::cookies::BilibiliCookieBundle;

#[cfg(not(target_os = "macos"))]
use keyring::{Entry, Error as KeyringError};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::{Mutex, OnceLock};

const SECRET_SERVICE: &str = "com.proudzhao.drift.bilibili.auth";
const SECRET_ACCOUNT: &str = "bilibili-cookie-bundle";

#[derive(Debug, Clone)]
enum CookieBundleCache {
    Unloaded,
    Loaded(Option<BilibiliCookieBundle>),
    Error(String),
}

pub(crate) fn load_cookie_bundle() -> Result<Option<BilibiliCookieBundle>, String> {
    let mut cache = credential_cache()
        .lock()
        .map_err(|error| format!("登录凭据缓存读取失败：{}", error))?;

    match &*cache {
        CookieBundleCache::Loaded(bundle) => return Ok(bundle.clone()),
        CookieBundleCache::Error(error) => return Err(error.clone()),
        CookieBundleCache::Unloaded => {}
    }

    let bundle = match read_secret()? {
        Some(secret) => {
            let bundle = serde_json::from_str::<BilibiliCookieBundle>(&secret)
                .map_err(|error| format!("登录凭据解析失败：{}", error));
            match bundle {
                Ok(bundle) => Some(bundle),
                Err(error) => {
                    *cache = CookieBundleCache::Error(error.clone());
                    return Err(error);
                }
            }
        }
        None => None,
    };
    *cache = CookieBundleCache::Loaded(bundle.clone());
    Ok(bundle)
}

pub(crate) fn save_cookie_bundle(bundle: &BilibiliCookieBundle) -> Result<(), String> {
    let secret = serde_json::to_string(bundle).map_err(|error| error.to_string())?;
    write_secret(&secret)?;
    set_cached_cookie_bundle(Some(bundle.clone()))
}

pub(crate) fn delete_cookie_bundle() -> Result<(), String> {
    delete_secret()?;
    set_cached_cookie_bundle(None)
}

pub(crate) fn is_expired(expires_at: Option<i64>, now: i64) -> bool {
    expires_at.is_some_and(|expires_at| expires_at <= now)
}

fn read_secret() -> Result<Option<String>, String> {
    read_secret_from_store()
}

fn write_secret(secret: &str) -> Result<(), String> {
    write_secret_to_store(secret)
}

fn delete_secret() -> Result<(), String> {
    delete_secret_from_store()
}

fn credential_cache() -> &'static Mutex<CookieBundleCache> {
    static CACHE: OnceLock<Mutex<CookieBundleCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(CookieBundleCache::Unloaded))
}

fn set_cached_cookie_bundle(bundle: Option<BilibiliCookieBundle>) -> Result<(), String> {
    let mut cache = credential_cache()
        .lock()
        .map_err(|error| format!("登录凭据缓存更新失败：{}", error))?;
    *cache = CookieBundleCache::Loaded(bundle);
    Ok(())
}

#[cfg(target_os = "macos")]
fn read_secret_from_store() -> Result<Option<String>, String> {
    let output = Command::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-a",
            SECRET_ACCOUNT,
            "-s",
            SECRET_SERVICE,
            "-w",
        ])
        .output()
        .map_err(|error| format!("读取 Keychain 失败：{}", error))?;

    if output.status.success() {
        return String::from_utf8(output.stdout)
            .map(|value| Some(value.trim_end_matches('\n').to_string()))
            .map_err(|error| format!("Keychain 凭据不是有效 UTF-8：{}", error));
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if is_not_found_error(&stderr) {
        return Ok(None);
    }
    Err(format!(
        "读取 Keychain 失败：{}",
        sanitize_security_error(&stderr)
    ))
}

#[cfg(not(target_os = "macos"))]
fn read_secret_from_store() -> Result<Option<String>, String> {
    match credential()?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "读取系统凭据失败：{}",
            sanitize_keyring_error(error)
        )),
    }
}

#[cfg(target_os = "macos")]
fn write_secret_to_store(secret: &str) -> Result<(), String> {
    let mut args = vec![
        "add-generic-password",
        "-a",
        SECRET_ACCOUNT,
        "-s",
        SECRET_SERVICE,
        "-w",
        secret,
        "-U",
    ];
    let trusted_app = current_executable_path();
    if let Some(path) = trusted_app.as_deref() {
        args.extend(["-T", path]);
    }

    let output = Command::new("/usr/bin/security")
        .args(args)
        .output()
        .map_err(|error| format!("写入 Keychain 失败：{}", error))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "写入 Keychain 失败：{}",
            sanitize_security_error(&stderr)
        ))
    }
}

#[cfg(not(target_os = "macos"))]
fn write_secret_to_store(secret: &str) -> Result<(), String> {
    credential()?
        .set_password(secret)
        .map_err(|error| format!("写入系统凭据失败：{}", sanitize_keyring_error(error)))
}

#[cfg(target_os = "macos")]
fn delete_secret_from_store() -> Result<(), String> {
    let output = Command::new("/usr/bin/security")
        .args([
            "delete-generic-password",
            "-a",
            SECRET_ACCOUNT,
            "-s",
            SECRET_SERVICE,
        ])
        .output()
        .map_err(|error| format!("删除 Keychain 凭据失败：{}", error))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if is_not_found_error(&stderr) {
        return Ok(());
    }
    Err(format!(
        "删除 Keychain 凭据失败：{}",
        sanitize_security_error(&stderr)
    ))
}

#[cfg(target_os = "macos")]
fn current_executable_path() -> Option<String> {
    std::env::current_exe()
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg(not(target_os = "macos"))]
fn delete_secret_from_store() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "删除系统凭据失败：{}",
            sanitize_keyring_error(error)
        )),
    }
}

#[cfg(not(target_os = "macos"))]
fn credential() -> Result<Entry, String> {
    Entry::new(SECRET_SERVICE, SECRET_ACCOUNT)
        .map_err(|error| format!("初始化系统凭据失败：{}", sanitize_keyring_error(error)))
}

#[cfg(not(target_os = "macos"))]
fn sanitize_keyring_error(error: KeyringError) -> String {
    error.to_string()
}

#[cfg(target_os = "macos")]
fn is_not_found_error(stderr: &str) -> bool {
    stderr.contains("could not be found")
        || stderr.contains("specified item could not be found")
        || stderr.contains("-25300")
}

#[cfg(target_os = "macos")]
fn sanitize_security_error(stderr: &str) -> String {
    let trimmed = stderr.trim();
    if trimmed.is_empty() {
        "未知 Keychain 错误".to_string()
    } else {
        trimmed.to_string()
    }
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
