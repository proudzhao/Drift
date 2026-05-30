use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Position, State, WebviewUrl,
    WebviewWindowBuilder,
};

use super::state::{EditModeState, SendWindowDrag};

pub fn open_send_danmaku_window(app: AppHandle) -> Result<(), String> {
    show_send_danmaku_window(&app)
}

pub fn hide_send_danmaku_window(app: AppHandle) -> Result<(), String> {
    hide_send_danmaku_window_inner(&app)
}

pub fn begin_send_danmaku_window_drag(
    app: AppHandle,
    state: State<'_, EditModeState>,
    screen_x: f64,
    screen_y: f64,
) -> Result<(), String> {
    let window = send_window(&app)?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let mut drag = state.send_drag.lock().map_err(|error| error.to_string())?;
    *drag = Some(SendWindowDrag {
        origin_mouse_x: screen_x,
        origin_mouse_y: screen_y,
        origin_window_x: position.x,
        origin_window_y: position.y,
        scale_factor,
    });
    Ok(())
}

pub fn drag_send_danmaku_window(
    app: AppHandle,
    state: State<'_, EditModeState>,
    screen_x: f64,
    screen_y: f64,
) -> Result<(), String> {
    let drag = state
        .send_drag
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    let Some(drag) = drag else {
        return Ok(());
    };

    let next_x = drag.origin_window_x
        + ((screen_x - drag.origin_mouse_x) * drag.scale_factor).round() as i32;
    let next_y = drag.origin_window_y
        + ((screen_y - drag.origin_mouse_y) * drag.scale_factor).round() as i32;
    send_window(&app)?
        .set_position(Position::Physical(PhysicalPosition::new(next_x, next_y)))
        .map_err(|error| error.to_string())
}

pub fn end_send_danmaku_window_drag(state: State<'_, EditModeState>) -> Result<(), String> {
    let mut drag = state.send_drag.lock().map_err(|error| error.to_string())?;
    *drag = None;
    Ok(())
}

pub(super) fn show_send_danmaku_window(app: &AppHandle) -> Result<(), String> {
    let (window, is_new_window) = match app.get_webview_window("send") {
        Some(window) => (window, false),
        None => (
            WebviewWindowBuilder::new(app, "send", WebviewUrl::App("index.html".into()))
                .title("发送弹幕")
                .inner_size(460.0, 116.0)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .shadow(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .build()
                .map_err(|error| error.to_string())?,
            true,
        ),
    };

    if is_new_window {
        position_send_window_bottom_right(&window);
    }

    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    app.emit_to("send", "send-window-opened", ())
        .map_err(|error| error.to_string())?;
    tracing::info!(target: "drift::window", "send danmaku window opened");
    Ok(())
}

fn position_send_window_bottom_right(window: &tauri::WebviewWindow) {
    let position = || -> Result<PhysicalPosition<i32>, String> {
        let monitor = window
            .primary_monitor()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "primary monitor not found".to_string())?;
        let work_area = monitor.work_area();
        let window_size = window.outer_size().map_err(|error| error.to_string())?;
        let margin = 24;
        let x =
            work_area.position.x + work_area.size.width as i32 - window_size.width as i32 - margin;
        let y = work_area.position.y + work_area.size.height as i32
            - window_size.height as i32
            - margin;

        Ok(PhysicalPosition::new(
            x.max(work_area.position.x),
            y.max(work_area.position.y),
        ))
    };

    match position() {
        Ok(position) => {
            if let Err(error) = window.set_position(Position::Physical(position)) {
                tracing::warn!(
                    target: "drift::window",
                    error = %error,
                    "failed to position send danmaku window"
                );
            }
        }
        Err(error) => tracing::warn!(
            target: "drift::window",
            error = %error,
            "failed to calculate send danmaku window position"
        ),
    }
}

fn hide_send_danmaku_window_inner(app: &AppHandle) -> Result<(), String> {
    let window = send_window(app)?;
    window.hide().map_err(|error| error.to_string())?;
    tracing::info!(target: "drift::window", "send danmaku window hidden");
    Ok(())
}

fn send_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("send")
        .ok_or_else(|| "send window not found".to_string())
}
