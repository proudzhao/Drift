use std::fs;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tracing_subscriber::fmt::writer::MakeWriterExt;
use tracing_subscriber::EnvFilter;

pub fn init(app: &AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("日志目录获取失败：{}", error))?;
    fs::create_dir_all(&log_dir).map_err(|error| format!("日志目录创建失败：{}", error))?;

    let file_appender = tracing_appender::rolling::daily(&log_dir, "drift.log");
    let writer = std::io::stderr.and(file_appender);
    let filter = EnvFilter::builder()
        .with_env_var("DRIFT_LOG")
        .from_env_lossy()
        .add_directive(
            "info"
                .parse()
                .map_err(|error| format!("日志级别解析失败：{}", error))?,
        )
        .add_directive(
            "tauri=info"
                .parse()
                .map_err(|error| format!("日志级别解析失败：{}", error))?,
        )
        .add_directive(
            "wry=warn"
                .parse()
                .map_err(|error| format!("日志级别解析失败：{}", error))?,
        );

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(writer)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .try_init()
        .map_err(|error| format!("日志初始化失败：{}", error))?;

    tracing::info!(target: "drift::app", path = %log_dir.display(), "logging initialized");
    Ok(())
}

#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("日志目录获取失败：{}", error))?;
    fs::create_dir_all(&log_dir).map_err(|error| format!("日志目录创建失败：{}", error))?;
    let log_dir = log_dir.to_string_lossy().to_string();
    app.opener()
        .open_path(log_dir, None::<&str>)
        .map_err(|error| format!("日志目录打开失败：{}", error))
}
