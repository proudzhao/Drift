use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tracing::{debug, info, warn};

const RELEASES_URL: &str = "https://api.github.com/repos/proudzhao/Drift/releases/latest";
const AUTO_CHECK_DELAY_SECONDS: u64 = 4;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CachedUpdateResult {
    pub result: Option<CheckUpdateResult>,
    pub checked_at: Option<i64>,
    pub is_checking: bool,
}

#[derive(Debug, Default)]
pub struct UpdateCheckState {
    cached: Mutex<CachedUpdateResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckUpdateResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersion {
    pub version: String,
}

#[tauri::command]
pub fn get_app_version() -> AppVersion {
    AppVersion {
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub async fn check_update(state: State<'_, UpdateCheckState>) -> Result<CheckUpdateResult, String> {
    begin_check(&state)?;
    match check_update_inner().await {
        Ok(result) => {
            finish_check(&state, Some(result.clone()))?;
            Ok(result)
        }
        Err(error) => {
            finish_check(&state, None)?;
            Err(error)
        }
    }
}

#[tauri::command]
pub fn get_cached_update_result(
    state: State<'_, UpdateCheckState>,
) -> Result<CachedUpdateResult, String> {
    state
        .cached
        .lock()
        .map(|cached| cached.clone())
        .map_err(|error| format!("更新检查状态读取失败：{}", error))
}

pub fn start_auto_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(AUTO_CHECK_DELAY_SECONDS)).await;

        let Ok(config) = crate::app_config::read_app_config(&app) else {
            warn!(target: "drift::update", "failed to read config before auto update check");
            return;
        };
        if !config.update.check_on_startup {
            debug!(target: "drift::update", "startup update check disabled");
            return;
        }

        let state = app.state::<UpdateCheckState>();
        if let Err(error) = begin_check(&state) {
            warn!(target: "drift::update", error = %error, "failed to mark update check started");
            return;
        }

        match check_update_inner().await {
            Ok(result) => {
                if let Err(error) = finish_check(&state, Some(result.clone())) {
                    warn!(target: "drift::update", error = %error, "failed to cache update result");
                }
                if result.has_update {
                    if let Err(error) = app.emit("update-available", result) {
                        warn!(target: "drift::update", error = %error, "failed to emit update-available");
                    }
                }
            }
            Err(error) => {
                let _ = finish_check(&state, None);
                info!(target: "drift::update", error = %error, "startup update check failed silently");
            }
        }
    });
}

async fn check_update_inner() -> Result<CheckUpdateResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    debug!(target: "drift::update", current_version, "checking for updates");

    let client = reqwest::Client::builder()
        .user_agent("Drift-Update-Check/1.0")
        .build()
        .map_err(|error| format!("HTTP 客户端创建失败：{}", error))?;

    let response = client
        .get(RELEASES_URL)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| {
            warn!(target: "drift::update", error = %error, "github releases request failed");
            format!("{}", error)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        if status.as_u16() == 404 {
            debug!(target: "drift::update", "no github release found yet");
            return Ok(CheckUpdateResult {
                has_update: false,
                current_version,
                latest_version: String::new(),
                release_url: String::new(),
                error: Some("暂无已发布的版本".to_string()),
            });
        }
        warn!(target: "drift::update", status = %status, "github releases returned non-200");
        return Err(format!("GitHub API 返回 {}", status));
    }

    let release = response.json::<GitHubRelease>().await.map_err(|error| {
        warn!(target: "drift::update", error = %error, "github releases json parse failed");
        format!("{}", error)
    })?;

    let latest = release
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&release.tag_name);
    let has_update = compare_versions(latest, &current_version) == std::cmp::Ordering::Greater;

    debug!(
        target: "drift::update",
        current_version,
        latest_version = latest,
        has_update,
        "update check complete"
    );

    Ok(CheckUpdateResult {
        has_update,
        current_version,
        latest_version: release.tag_name,
        release_url: release.html_url,
        error: None,
    })
}

fn begin_check(state: &UpdateCheckState) -> Result<(), String> {
    let mut cached = state
        .cached
        .lock()
        .map_err(|error| format!("更新检查状态更新失败：{}", error))?;
    cached.is_checking = true;
    Ok(())
}

fn finish_check(state: &UpdateCheckState, result: Option<CheckUpdateResult>) -> Result<(), String> {
    let mut cached = state
        .cached
        .lock()
        .map_err(|error| format!("更新检查状态更新失败：{}", error))?;
    cached.result = result;
    cached.checked_at = Some(now_unix());
    cached.is_checking = false;
    Ok(())
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

/// Returns Greater if `a > b`, i.e. if an update is available.
fn compare_versions(latest: &str, current: &str) -> std::cmp::Ordering {
    #[derive(Debug)]
    struct VersionParts {
        numbers: Vec<u32>,
        is_prerelease: bool,
    }

    let parse = |version: &str| -> VersionParts {
        let normalized = version.trim().strip_prefix('v').unwrap_or(version.trim());
        let (base, prerelease) = normalized
            .split_once('-')
            .map_or((normalized, None), |(base, prerelease)| {
                (base, Some(prerelease))
            });
        let numbers = base
            .split('.')
            .filter(|segment| !segment.is_empty())
            .filter_map(|segment| segment.parse::<u32>().ok())
            .collect();
        VersionParts {
            numbers,
            is_prerelease: prerelease.is_some_and(|value| !value.trim().is_empty()),
        }
    };

    let latest_parts = parse(latest);
    let current_parts = parse(current);

    let max_len = latest_parts.numbers.len().max(current_parts.numbers.len());
    for index in 0..max_len {
        let latest_part = latest_parts.numbers.get(index).copied().unwrap_or(0);
        let current_part = current_parts.numbers.get(index).copied().unwrap_or(0);
        match latest_part.cmp(&current_part) {
            std::cmp::Ordering::Equal => continue,
            ordering => return ordering,
        }
    }

    match (latest_parts.is_prerelease, current_parts.is_prerelease) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => std::cmp::Ordering::Equal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_compare() {
        assert!(compare_versions("0.3.0", "0.2.0").is_gt());
        assert!(compare_versions("0.2.1", "0.2.0").is_gt());
        assert!(compare_versions("1.0.0", "0.9.9").is_gt());
        assert!(compare_versions("0.2.0", "0.2.0").is_eq());
        assert!(compare_versions("0.1.9", "0.2.0").is_lt());
        assert!(compare_versions("0.2.0-beta", "0.2.0").is_lt());
        assert!(compare_versions("0.2.0", "0.2.0-beta").is_gt());
        assert!(compare_versions("v0.3.0", "0.2.0").is_gt());
        assert!(compare_versions("v0.4.0", "0.4.0").is_eq());
        assert!(compare_versions("0.4", "0.4.0").is_eq());
    }
}
