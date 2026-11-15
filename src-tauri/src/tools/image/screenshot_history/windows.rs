//! 截图透明层、贴图窗口和窗口关闭事件。
use super::state::{drafts, COUNTER};
use super::store::{png_dimensions, safe_item_path};
use std::path::Path;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};
pub(super) fn screenshot_prepare(app: AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    if app.get_webview_window("screenshot-overlay").is_none() {
        WebviewWindowBuilder::new(
            &app,
            "screenshot-overlay",
            WebviewUrl::App("index.html?window=screenshot-overlay".into()),
        )
        .title("Open Tools Screenshot")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .content_protected(true)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .inner_size(800.0, 600.0)
        .build()
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 前端准备好透明选区层后显示，不改变原有桌面内容。
pub(super) fn screenshot_show(app: AppHandle, draft_id: String) -> Result<(), String> {
    let active = drafts()
        .lock()
        .map_err(|_| "Screenshot state is unavailable")?
        .contains_key(&draft_id);
    if active {
        let overlay = app
            .get_webview_window("screenshot-overlay")
            .ok_or("Screenshot window is unavailable")?;
        overlay.show().map_err(|e| e.to_string())?;
        overlay.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
pub(super) fn create_pin<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    path: &Path,
) -> Result<(), String> {
    let (width, height) = png_dimensions(path).unwrap_or((480, 320));
    let scale = (720.0 / width as f64).min(540.0 / height as f64).min(1.0);
    let window_width = (width as f64 * scale).max(180.0);
    let window_height = (height as f64 * scale).max(100.0);
    let label = format!("screenshot-pin-{}", COUNTER.fetch_add(1, Ordering::Relaxed));
    let url = WebviewUrl::App(format!("index.html?window=screenshot-pin&id={id}").into());
    WebviewWindowBuilder::new(app, label, url)
        .title("Open Tools Pin")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .content_protected(true)
        .resizable(true)
        .inner_size(window_width, window_height)
        .min_inner_size(140.0, 80.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub(super) fn screenshot_pin(app: AppHandle, id: String) -> Result<(), String> {
    let path = safe_item_path(&app, &id)?;
    if !path.is_file() {
        return Err("Screenshot not found".into());
    }
    #[cfg(windows)]
    return create_pin(&app, &id, &path);
    #[cfg(not(windows))]
    Err("Screenshot pins are only supported on Windows".into())
}

/// Alt+F4 只隐藏截图层并释放临时图片，主窗口保持原有状态。
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if window.label() != "screenshot-overlay"
        || !matches!(event, WindowEvent::CloseRequested { .. })
    {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    }
    drafts().lock().ok().and_then(|mut state| {
        let id = state.keys().next()?.clone();
        state.remove(&id)
    });
}
