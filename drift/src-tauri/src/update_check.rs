use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersion {
    pub version: String,
}

#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> AppVersion {
    AppVersion {
        version: app.package_info().version.to_string(),
    }
}
