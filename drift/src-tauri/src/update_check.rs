use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

const RELEASES_URL: &str = "https://api.github.com/repos/proudzhao/Drift/releases/latest";

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
pub async fn check_update() -> Result<CheckUpdateResult, String> {
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
        warn!(target: "drift::update", status = %status, "github releases returned non-200");
        return Err(format!("GitHub API 返回 {}", status));
    }

    let release = response
        .json::<GitHubRelease>()
        .await
        .map_err(|error| {
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

/// Returns Greater if `a > b`, i.e. if an update is available.
fn compare_versions(latest: &str, current: &str) -> std::cmp::Ordering {
    let parse = |version: &str| -> Vec<u32> {
        version
            .split(|character: char| !character.is_ascii_digit())
            .filter(|segment| !segment.is_empty())
            .filter_map(|segment| segment.parse::<u32>().ok())
            .collect()
    };

    let latest_parts = parse(latest);
    let current_parts = parse(current);

    for (index, latest_part) in latest_parts.iter().enumerate() {
        match current_parts.get(index) {
            Some(current_part) => match latest_part.cmp(current_part) {
                std::cmp::Ordering::Equal => continue,
                ordering => return ordering,
            },
            None => return std::cmp::Ordering::Greater,
        }
    }

    if latest_parts.len() < current_parts.len() {
        std::cmp::Ordering::Less
    } else {
        std::cmp::Ordering::Equal
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
        assert!(compare_versions("v0.3.0", "0.2.0").is_gt());
    }
}
