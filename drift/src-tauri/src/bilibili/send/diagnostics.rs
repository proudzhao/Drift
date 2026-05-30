use tauri::{AppHandle, Manager};

use crate::bilibili::session;

use super::state::{now_unix, SendDanmakuState};

pub(super) fn diagnostic_lines(app: &AppHandle) -> Vec<String> {
    let (is_logged_in, has_bili_jct) = match session::load_cookie_bundle() {
        Ok(Some(bundle)) => (
            !session::is_expired(bundle.expires_at, now_unix()),
            !bundle.bili_jct.trim().is_empty(),
        ),
        Ok(None) | Err(_) => (false, false),
    };
    let last_result = app
        .try_state::<SendDanmakuState>()
        .map(|state| state.last_result_snapshot())
        .unwrap_or_default();

    vec![
        format!("send.auth.is_logged_in={}", is_logged_in),
        format!("send.auth.has_bili_jct={}", has_bili_jct),
        format!(
            "send.last_code={}",
            last_result
                .code
                .map_or("".to_string(), |code| code.to_string())
        ),
        format!("send.last_error={}", last_result.error.unwrap_or_default()),
    ]
}
