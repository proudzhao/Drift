use super::types::UserConnectionError;

pub(crate) fn classify_connection_error(error: &str) -> UserConnectionError {
    if error.contains("房间号不存在") || error.contains("room_init 返回错误") {
        return UserConnectionError {
            status: "invalid_room",
            message: "找不到该直播间，请确认房间号是否正确".to_string(),
            is_terminal: true,
        };
    }

    if error.contains("-799") || error.contains("请求过于频繁") {
        return UserConnectionError {
            status: "reconnecting",
            message: "B 站暂时限制了请求频率，请稍后再试".to_string(),
            is_terminal: false,
        };
    }

    if error.contains("-352") {
        return UserConnectionError {
            status: "reconnecting",
            message: "B 站安全校验未通过，请稍后重试或检查网络环境".to_string(),
            is_terminal: false,
        };
    }

    if error.contains("HTTP") {
        return UserConnectionError {
            status: "reconnecting",
            message: "B 站服务器响应异常，请稍后重试".to_string(),
            is_terminal: false,
        };
    }

    if error.contains("WebSocket") || error.contains("服务器关闭连接") {
        return UserConnectionError {
            status: "reconnecting",
            message: "弹幕服务器连接中断，正在自动重连".to_string(),
            is_terminal: false,
        };
    }

    if error.contains("请求失败") || error.contains("响应读取失败") {
        return UserConnectionError {
            status: "reconnecting",
            message: "网络连接失败，请检查网络后等待重试".to_string(),
            is_terminal: false,
        };
    }

    UserConnectionError {
        status: "reconnecting",
        message: "弹幕连接失败，正在尝试重连".to_string(),
        is_terminal: false,
    }
}
