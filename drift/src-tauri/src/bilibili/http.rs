use super::types::{
    cache_anchor_name, cached_anchor_name, response_preview, ApiResponse, BuvidData, DanmuInfo,
    DeviceCookie, NavData, RoomBaseInfoData, RoomInfoByRoom, RoomInitData, SpaceInfo,
    BROWSER_USER_AGENT, BUVID_URL, DANMU_INFO_URL, NAV_URL, ROOM_BASE_INFO_URL, ROOM_INFO_URL,
    ROOM_INIT_URL, SPACE_INFO_URL,
};
use super::types::{encode_wbi_component, extract_url_file_stem, filter_wbi_value, mixin_key};
use reqwest::header::{ACCEPT, REFERER, USER_AGENT};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, warn};

pub(crate) async fn fetch_room_info(room_id: u64, cookie: &str) -> Result<RoomInfoByRoom, String> {
    debug!(target: "drift::bilibili.http", room_id, "requesting room info");
    let response = reqwest::Client::new()
        .get(ROOM_INFO_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://live.bilibili.com/")
        .header("Cookie", cookie)
        .query(&[("room_id", room_id)])
        .send()
        .await
        .map_err(|error| format!("直播间信息请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("直播间信息响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "直播间信息 HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response =
        serde_json::from_slice::<ApiResponse<RoomInfoByRoom>>(&bytes).map_err(|error| {
            format!(
                "直播间信息 JSON 解析失败：{}；响应片段：{}",
                error,
                response_preview(&bytes)
            )
        })?;

    if response.code != 0 {
        return Err(format!(
            "房间号不存在或不可访问：{} {}",
            response.code, response.message
        ));
    }

    response
        .data
        .ok_or_else(|| "直播间信息响应缺少 data 字段".to_string())
}

pub(crate) async fn resolve_anchor_name(room_id: u64, uid: u64, cookie: &str) -> Option<String> {
    if let Some(anchor_name) = cached_anchor_name(uid) {
        debug!(target: "drift::bilibili.http", room_id, anchor_uid = uid, "using cached anchor name");
        return Some(anchor_name);
    }

    match fetch_room_base_anchor_name(room_id, uid, cookie).await {
        Ok(anchor_name) => {
            cache_anchor_name(uid, &anchor_name);
            return Some(anchor_name);
        }
        Err(error) => warn!(
            target: "drift::bilibili.http",
            room_id,
            anchor_uid = uid,
            error = %error,
            "room base info request failed; trying anchor profile fallback"
        ),
    }

    match fetch_anchor_name(uid, cookie).await {
        Ok(anchor_name) => {
            cache_anchor_name(uid, &anchor_name);
            return Some(anchor_name);
        }
        Err(error) => warn!(
            target: "drift::bilibili.http",
            room_id,
            anchor_uid = uid,
            error = %error,
            "anchor profile request failed; trying room info fallback"
        ),
    }

    match fetch_room_info(room_id, cookie).await {
        Ok(room_info) => {
            let anchor_name = room_info.anchor_info.base_info.uname;
            cache_anchor_name(uid, &anchor_name);
            Some(anchor_name)
        }
        Err(error) => {
            warn!(
                target: "drift::bilibili.http",
                room_id,
                error = %error,
                "room info fallback failed; continuing without anchor metadata"
            );
            None
        }
    }
}

pub(crate) async fn fetch_room_base_anchor_name(
    room_id: u64,
    uid: u64,
    cookie: &str,
) -> Result<String, String> {
    debug!(target: "drift::bilibili.http", room_id, "requesting room base info");
    let response = reqwest::Client::new()
        .get(ROOM_BASE_INFO_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://live.bilibili.com/")
        .header("Cookie", cookie)
        .query(&[
            ("room_ids", room_id.to_string()),
            ("req_biz", "web_room_componet".to_string()),
        ])
        .send()
        .await
        .map_err(|error| format!("直播间基础信息请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("直播间基础信息响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "直播间基础信息 HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response =
        serde_json::from_slice::<ApiResponse<RoomBaseInfoData>>(&bytes).map_err(|error| {
            format!(
                "直播间基础信息 JSON 解析失败：{}；响应片段：{}",
                error,
                response_preview(&bytes)
            )
        })?;

    if response.code != 0 {
        return Err(format!(
            "直播间基础信息返回错误：{} {}",
            response.code, response.message
        ));
    }

    let data = response
        .data
        .ok_or_else(|| "直播间基础信息响应缺少 data 字段".to_string())?;
    let room = data
        .by_room_ids
        .get(&room_id.to_string())
        .or_else(|| data.by_room_ids.values().find(|room| room.uid == uid))
        .ok_or_else(|| "直播间基础信息缺少当前房间".to_string())?;

    if room.uname.trim().is_empty() {
        return Err("直播间基础信息缺少 uname 字段".to_string());
    }

    Ok(room.uname.clone())
}

pub(crate) async fn fetch_danmu_info(room_id: u64, cookie: &str) -> Result<DanmuInfo, String> {
    let wbi_params = build_wbi_params(room_id, cookie).await?;
    fetch_danmu_info_with_params(room_id, cookie, &wbi_params).await
}

pub(crate) async fn fetch_danmu_info_with_params(
    room_id: u64,
    cookie: &str,
    wbi_params: &[(String, String)],
) -> Result<DanmuInfo, String> {
    debug!(target: "drift::bilibili.http", room_id, "requesting getDanmuInfo");
    let response = reqwest::Client::new()
        .get(DANMU_INFO_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://live.bilibili.com/")
        .header("Cookie", cookie)
        .query(&wbi_params)
        .send()
        .await
        .map_err(|error| format!("getDanmuInfo 请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("getDanmuInfo 响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "getDanmuInfo HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response = serde_json::from_slice::<ApiResponse<DanmuInfo>>(&bytes).map_err(|error| {
        format!(
            "getDanmuInfo JSON 解析失败：{}；响应片段：{}",
            error,
            response_preview(&bytes)
        )
    })?;

    if response.code != 0 {
        warn!(
            target: "drift::bilibili.http",
            room_id,
            code = response.code,
            message = %response.message,
            "getDanmuInfo returned non-zero code"
        );
        return Err(format!(
            "getDanmuInfo 返回错误：{} {}",
            response.code, response.message
        ));
    }

    response
        .data
        .ok_or_else(|| "getDanmuInfo 响应缺少 data 字段".to_string())
}

pub(crate) async fn build_wbi_params(
    room_id: u64,
    cookie: &str,
) -> Result<Vec<(String, String)>, String> {
    let mixin_key = fetch_wbi_mixin_key(cookie).await?;
    build_wbi_params_with_mixin_key(room_id, &mixin_key)
}

pub(crate) fn build_wbi_params_with_mixin_key(
    room_id: u64,
    mixin_key: &str,
) -> Result<Vec<(String, String)>, String> {
    let wts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{}", error))?
        .as_secs()
        .to_string();
    let mut params = vec![
        ("id".to_string(), room_id.to_string()),
        ("type".to_string(), "0".to_string()),
        ("web_location".to_string(), "444.8".to_string()),
        ("wts".to_string(), wts),
    ];
    params.sort_by(|left, right| left.0.cmp(&right.0));

    let query = params
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                encode_wbi_component(key),
                encode_wbi_component(&filter_wbi_value(value))
            )
        })
        .collect::<Vec<_>>()
        .join("&");
    let w_rid = format!("{:x}", md5::compute(format!("{}{}", query, mixin_key)));
    params.push(("w_rid".to_string(), w_rid));
    Ok(params)
}

pub(crate) async fn fetch_wbi_mixin_key(cookie: &str) -> Result<String, String> {
    debug!(target: "drift::bilibili.http", "requesting WBI nav keys");
    let response = reqwest::Client::new()
        .get(NAV_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com/")
        .header("Cookie", cookie)
        .send()
        .await
        .map_err(|error| format!("WBI nav 请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("WBI nav 响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "WBI nav HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response = serde_json::from_slice::<ApiResponse<NavData>>(&bytes).map_err(|error| {
        format!(
            "WBI nav JSON 解析失败：{}；响应片段：{}",
            error,
            response_preview(&bytes)
        )
    })?;

    let data = response
        .data
        .ok_or_else(|| format!("WBI nav 返回错误：{} {}", response.code, response.message))?;
    let raw_key = format!(
        "{}{}",
        extract_url_file_stem(&data.wbi_img.img_url)?,
        extract_url_file_stem(&data.wbi_img.sub_url)?
    );
    Ok(mixin_key(&raw_key))
}

pub(crate) async fn fetch_room_init(room_id: u64) -> Result<RoomInitData, String> {
    debug!(target: "drift::bilibili.http", room_id, "requesting room_init");
    let response = reqwest::Client::new()
        .get(ROOM_INIT_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://live.bilibili.com/")
        .query(&[("id", room_id)])
        .send()
        .await
        .map_err(|error| format!("room_init 请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("room_init 响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "room_init HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response =
        serde_json::from_slice::<ApiResponse<RoomInitData>>(&bytes).map_err(|error| {
            format!(
                "room_init JSON 解析失败：{}；响应片段：{}",
                error,
                response_preview(&bytes)
            )
        })?;

    if response.code != 0 {
        return Err(format!(
            "房间号不存在或不可访问：{} {}",
            response.code, response.message
        ));
    }

    response
        .data
        .ok_or_else(|| "room_init 响应缺少 data 字段".to_string())
}

pub(crate) async fn fetch_anchor_name(uid: u64, cookie: &str) -> Result<String, String> {
    debug!(target: "drift::bilibili.http", anchor_uid = uid, "requesting anchor profile");
    let response = reqwest::Client::new()
        .get(SPACE_INFO_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://space.bilibili.com/")
        .header("Cookie", cookie)
        .query(&[("mid", uid)])
        .send()
        .await
        .map_err(|error| format!("主播信息请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("主播信息响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "主播信息 HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response = serde_json::from_slice::<ApiResponse<SpaceInfo>>(&bytes).map_err(|error| {
        format!(
            "主播信息 JSON 解析失败：{}；响应片段：{}",
            error,
            response_preview(&bytes)
        )
    })?;

    if response.code != 0 {
        return Err(format!(
            "主播信息返回错误：{} {}",
            response.code, response.message
        ));
    }

    let data = response
        .data
        .ok_or_else(|| "主播信息响应缺少 data 字段".to_string())?;
    if data.name.trim().is_empty() {
        return Err("主播信息响应缺少 name 字段".to_string());
    }

    Ok(data.name)
}

pub(crate) async fn fetch_buvid() -> Result<DeviceCookie, String> {
    debug!(target: "drift::bilibili.http", "requesting anonymous buvid");
    let response = reqwest::Client::new()
        .get(BUVID_URL)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(USER_AGENT, BROWSER_USER_AGENT)
        .header(REFERER, "https://www.bilibili.com/")
        .send()
        .await
        .map_err(|error| format!("buvid 请求失败：{}", error))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("buvid 响应读取失败：{}", error))?;

    if !status.is_success() {
        return Err(format!(
            "buvid HTTP {}：{}",
            status,
            response_preview(&bytes)
        ));
    }

    let response = serde_json::from_slice::<ApiResponse<BuvidData>>(&bytes).map_err(|error| {
        format!(
            "buvid JSON 解析失败：{}；响应片段：{}",
            error,
            response_preview(&bytes)
        )
    })?;

    if response.code != 0 {
        return Err(format!(
            "buvid 返回错误：{} {}",
            response.code, response.message
        ));
    }

    let data = response
        .data
        .ok_or_else(|| "buvid 响应缺少 data 字段".to_string())?;
    let cookie = format!("buvid3={}; buvid4={};", data.b_3, data.b_4);
    Ok(DeviceCookie {
        buvid3: data.b_3,
        cookie,
    })
}
