use serde_json::Value;
use std::collections::BTreeMap;
use std::process::Command;

#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    platform_font_families().map(normalize_font_names)
}

#[cfg(target_os = "macos")]
fn platform_font_families() -> Result<Vec<String>, String> {
    let output = run_command(
        "system_profiler",
        &["SPFontsDataType", "-json", "-detailLevel", "mini"],
    )?;
    let value = serde_json::from_str::<Value>(&output)
        .map_err(|error| format!("字体列表 JSON 解析失败：{}", error))?;
    Ok(parse_macos_system_profiler_fonts(&value))
}

#[cfg(target_os = "windows")]
fn platform_font_families() -> Result<Vec<String>, String> {
    let script = r#"[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"#;
    run_command("powershell", &["-NoProfile", "-Command", script])
        .or_else(|_| run_command("powershell.exe", &["-NoProfile", "-Command", script]))
        .map(|output| output.lines().map(ToString::to_string).collect())
}

#[cfg(target_os = "linux")]
fn platform_font_families() -> Result<Vec<String>, String> {
    run_command("fc-list", &[":", "family"]).map(|output| parse_fc_list_families(&output))
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn platform_font_families() -> Result<Vec<String>, String> {
    Err("当前系统暂不支持字体枚举".to_string())
}

fn run_command(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("字体枚举命令启动失败：{}", error))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "字体枚举命令执行失败：{}",
            stderr.trim().lines().next().unwrap_or("unknown error")
        ));
    }
    String::from_utf8(output.stdout).map_err(|error| format!("字体列表编码解析失败：{}", error))
}

fn normalize_font_names(names: Vec<String>) -> Vec<String> {
    let mut deduped = BTreeMap::new();
    for name in names {
        let Some(name) = normalize_font_name(&name) else {
            continue;
        };
        let key = name.to_ascii_lowercase();
        deduped.entry(key).or_insert(name);
    }
    deduped.into_values().collect()
}

fn normalize_font_name(value: &str) -> Option<String> {
    let name = value
        .chars()
        .filter(|character| !character.is_control())
        .collect::<String>()
        .trim()
        .to_string();
    if name.is_empty() || name.chars().count() > 128 {
        None
    } else {
        Some(name)
    }
}

fn parse_macos_system_profiler_fonts(value: &Value) -> Vec<String> {
    let Some(items) = value.get("SPFontsDataType").and_then(Value::as_array) else {
        return Vec::new();
    };

    let mut fonts = Vec::new();
    for item in items {
        let before_len = fonts.len();
        if let Some(typefaces) = item.get("typefaces").and_then(Value::as_array) {
            for typeface in typefaces {
                if let Some(family) = typeface.get("family").and_then(Value::as_str) {
                    fonts.push(family.to_string());
                }
            }
        }
        if fonts.len() == before_len {
            if let Some(name) = item.get("_name").and_then(Value::as_str) {
                fonts.push(strip_font_extension(name));
            }
        }
    }
    fonts
}

fn parse_fc_list_families(output: &str) -> Vec<String> {
    output
        .lines()
        .flat_map(|line| line.split(','))
        .filter_map(|item| item.split(':').next())
        .map(ToString::to_string)
        .collect()
}

fn strip_font_extension(value: &str) -> String {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    for extension in [".ttf", ".otf", ".ttc", ".dfont"] {
        if lower.ends_with(extension) {
            let end = trimmed.len() - extension.len();
            return trimmed[..end].to_string();
        }
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalizes_and_deduplicates_font_names() {
        let fonts = normalize_font_names(vec![
            "  Arial  ".to_string(),
            "arial".to_string(),
            "".to_string(),
            "PingFang SC".to_string(),
            "Bad\u{0000}Name".to_string(),
        ]);

        assert_eq!(fonts, vec!["Arial", "BadName", "PingFang SC"]);
    }

    #[test]
    fn parses_macos_system_profiler_font_families() {
        let value = json!({
            "SPFontsDataType": [
                {
                    "_name": "NotoSansBatak-Regular.ttf",
                    "typefaces": [
                        {
                            "_name": "NotoSansBatak-Regular",
                            "family": "Noto Sans Batak",
                            "fullname": "Noto Sans Batak Regular"
                        }
                    ]
                },
                {
                    "_name": "FallbackFont.otf"
                }
            ]
        });

        let fonts = normalize_font_names(parse_macos_system_profiler_fonts(&value));

        assert_eq!(fonts, vec!["FallbackFont", "Noto Sans Batak"]);
    }

    #[test]
    fn parses_fc_list_family_output() {
        let fonts = normalize_font_names(parse_fc_list_families(
            "Noto Sans CJK SC,Noto Sans CJK SC Black\nInter\n",
        ));

        assert_eq!(
            fonts,
            vec!["Inter", "Noto Sans CJK SC", "Noto Sans CJK SC Black"]
        );
    }
}
