use std::fs;
use std::time::SystemTime;

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

#[tauri::command]
pub fn export_diagnostics(app: AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("日志目录获取失败：{}", error))?;
    fs::create_dir_all(&log_dir).map_err(|error| format!("日志目录创建失败：{}", error))?;

    let unix_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let export_name = format!("drift-diagnostics-{}.txt", unix_secs);
    let export_path = log_dir.join(&export_name);

    let mut output = String::new();

    // Header
    output.push_str("=== Drift 诊断报告 ===\n");
    output.push_str(&format!("生成时间戳：{}\n", unix_secs));
    output.push_str(&format!("应用版本：{}\n", env!("CARGO_PKG_VERSION")));
    output.push_str(&format!("操作系统：{}\n", std::env::consts::OS));
    output.push_str("\n");

    // Log file
    output.push_str("=== 最近日志 ===\n");
    let log_file = log_dir.join("drift.log");
    if log_file.exists() {
        match fs::read_to_string(&log_file) {
            Ok(content) => {
                let trimmed: String = content
                    .lines()
                    .rev()
                    .take(500)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join("\n");
                output.push_str(&trimmed);
            }
            Err(error) => {
                output.push_str(&format!("日志读取失败：{}\n", error));
            }
        }
    } else {
        output.push_str("日志文件不存在\n");
    }
    output.push_str("\n\n");

    // Config (sanitized)
    output.push_str("=== 应用配置 ===\n");
    match crate::app_config::read_app_config(&app) {
        Ok(config) => {
            let json =
                serde_json::to_string_pretty(&config).unwrap_or_else(|_| "序列化失败".to_string());
            output.push_str(&json);
        }
        Err(error) => {
            output.push_str(&format!("配置读取失败：{}\n", error));
        }
    }
    output.push_str("\n\n");

    // Authentication state (sanitized)
    output.push_str("=== B 站认证状态 ===\n");
    for line in crate::bilibili::auth::diagnostic_lines(&app) {
        output.push_str(&line);
        output.push('\n');
    }
    output.push('\n');

    // Danmaku send state (sanitized)
    output.push_str("=== 弹幕发送状态 ===\n");
    for line in crate::bilibili::send::diagnostic_lines(&app) {
        output.push_str(&line);
        output.push('\n');
    }
    output.push('\n');

    // Environment info
    output.push_str("=== 环境信息 ===\n");
    output.push_str(&format!("OS: {}\n", std::env::consts::OS));
    output.push_str(&format!("Arch: {}\n", std::env::consts::ARCH));
    output.push_str(&format!("Tauri version: {}\n", tauri::VERSION));

    // Write to file
    fs::write(&export_path, &output).map_err(|error| format!("诊断文件写入失败：{}", error))?;

    let path_str = export_path.to_string_lossy().to_string();
    tracing::info!(target: "drift::diagnostics", path = %path_str, "diagnostics exported");

    // Open the file
    app.opener()
        .open_path(&path_str, None::<&str>)
        .map_err(|error| format!("诊断文件打开失败：{}", error))?;

    Ok(export_name)
}
