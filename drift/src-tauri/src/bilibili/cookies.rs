#![allow(dead_code)]

use serde::{Deserialize, Serialize};

const REDACTED: &str = "<redacted>";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BilibiliCookieBundle {
    pub sessdata: String,
    pub bili_jct: String,
    pub dede_user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dede_user_id_ck_md5: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
}

impl BilibiliCookieBundle {
    pub(crate) fn uid(&self) -> Option<u64> {
        self.dede_user_id.parse::<u64>().ok()
    }

    pub(crate) fn cookie_header(&self) -> String {
        let mut parts = vec![
            format!("SESSDATA={}", self.sessdata),
            format!("bili_jct={}", self.bili_jct),
            format!("DedeUserID={}", self.dede_user_id),
        ];

        if let Some(value) = &self.dede_user_id_ck_md5 {
            parts.push(format!("DedeUserID__ckMd5={}", value));
        }
        if let Some(value) = &self.sid {
            parts.push(format!("sid={}", value));
        }

        format!("{};", parts.join("; "))
    }

    pub(crate) fn redacted_cookie_header(&self) -> String {
        let mut parts = vec![
            format!("SESSDATA={}", REDACTED),
            format!("bili_jct={}", REDACTED),
            format!("DedeUserID={}", redact_visible_tail(&self.dede_user_id)),
        ];

        if self.dede_user_id_ck_md5.is_some() {
            parts.push(format!("DedeUserID__ckMd5={}", REDACTED));
        }
        if self.sid.is_some() {
            parts.push(format!("sid={}", REDACTED));
        }

        format!("{};", parts.join("; "))
    }
}

pub(crate) fn parse_set_cookie_headers(
    headers: impl IntoIterator<Item = String>,
    refresh_token: Option<String>,
    expires_at: Option<i64>,
) -> Result<BilibiliCookieBundle, String> {
    let mut sessdata = None;
    let mut bili_jct = None;
    let mut dede_user_id = None;
    let mut dede_user_id_ck_md5 = None;
    let mut sid = None;

    for header in headers {
        let Some((name, value)) = parse_cookie_pair(&header) else {
            continue;
        };
        match name.as_str() {
            "SESSDATA" => sessdata = Some(value),
            "bili_jct" => bili_jct = Some(value),
            "DedeUserID" => dede_user_id = Some(value),
            "DedeUserID__ckMd5" => dede_user_id_ck_md5 = Some(value),
            "sid" => sid = Some(value),
            _ => {}
        }
    }

    Ok(BilibiliCookieBundle {
        sessdata: required_cookie("SESSDATA", sessdata)?,
        bili_jct: required_cookie("bili_jct", bili_jct)?,
        dede_user_id: required_cookie("DedeUserID", dede_user_id)?,
        dede_user_id_ck_md5,
        sid,
        refresh_token,
        expires_at,
    })
}

pub(crate) fn redact_cookie_header(header: &str) -> String {
    header
        .split(';')
        .filter_map(|part| {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                return None;
            }
            let (name, value) = trimmed.split_once('=')?;
            let redacted = match name {
                "DedeUserID" => redact_visible_tail(value),
                _ => REDACTED.to_string(),
            };
            Some(format!("{}={}", name, redacted))
        })
        .collect::<Vec<_>>()
        .join("; ")
}

pub(crate) fn merge_cookie_headers(left: &str, right: &str) -> String {
    [left.trim(), right.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_cookie_pair(header: &str) -> Option<(String, String)> {
    let first = header.split(';').next()?.trim();
    let (name, value) = first.split_once('=')?;
    if name.is_empty() || value.is_empty() {
        return None;
    }
    Some((name.to_string(), value.to_string()))
}

fn required_cookie(name: &str, value: Option<String>) -> Result<String, String> {
    value.ok_or_else(|| format!("登录响应缺少 {} Cookie", name))
}

fn redact_visible_tail(value: &str) -> String {
    if value.len() <= 4 {
        return REDACTED.to_string();
    }
    format!(
        "{}{}",
        "*".repeat(value.len().saturating_sub(4)),
        &value[value.len() - 4..]
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_required_login_cookies() {
        let bundle = parse_set_cookie_headers(
            vec![
                "SESSDATA=secret; Path=/; HttpOnly".to_string(),
                "bili_jct=csrf; Path=/".to_string(),
                "DedeUserID=123456789; Path=/".to_string(),
                "DedeUserID__ckMd5=checksum; Path=/".to_string(),
                "sid=session; Path=/".to_string(),
            ],
            Some("refresh".to_string()),
            Some(123),
        )
        .unwrap();

        assert_eq!(bundle.sessdata, "secret");
        assert_eq!(bundle.bili_jct, "csrf");
        assert_eq!(bundle.uid(), Some(123456789));
        assert_eq!(bundle.refresh_token.as_deref(), Some("refresh"));
        assert_eq!(
            bundle.cookie_header(),
            "SESSDATA=secret; bili_jct=csrf; DedeUserID=123456789; DedeUserID__ckMd5=checksum; sid=session;"
        );
    }

    #[test]
    fn rejects_missing_required_login_cookies() {
        let error = parse_set_cookie_headers(
            vec![
                "SESSDATA=secret; Path=/".to_string(),
                "DedeUserID=123456789; Path=/".to_string(),
            ],
            None,
            None,
        )
        .unwrap_err();

        assert!(error.contains("bili_jct"));
    }

    #[test]
    fn redacts_sensitive_cookie_values() {
        let redacted = redact_cookie_header(
            "SESSDATA=secret; bili_jct=csrf; DedeUserID=123456789; sid=session;",
        );

        assert!(redacted.contains("SESSDATA=<redacted>"));
        assert!(redacted.contains("bili_jct=<redacted>"));
        assert!(redacted.contains("DedeUserID=*****6789"));
        assert!(!redacted.contains("secret"));
        assert!(!redacted.contains("csrf"));
    }

    #[test]
    fn merges_cookie_headers_without_extra_spaces() {
        let merged = merge_cookie_headers(
            "SESSDATA=secret; bili_jct=csrf;",
            "buvid3=device3; buvid4=device4;",
        );

        assert_eq!(
            merged,
            "SESSDATA=secret; bili_jct=csrf; buvid3=device3; buvid4=device4;"
        );
        assert_eq!(
            merge_cookie_headers("", "buvid3=device3;"),
            "buvid3=device3;"
        );
    }
}
