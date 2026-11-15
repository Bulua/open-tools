//! 前端可调用的截图命令，负责协调捕获、窗口、状态与存储。
use super::capture::{capture_desktop, desktop_bounds, window_targets};
use super::clipboard::copy_screenshot;
use super::state::{drafts, finish_draft, Draft, StartingGuard, COUNTER, STARTING};
use super::store::{item_from_path, local_stamp, screenshots_dir, MAX_PNG_SIZE};
use super::types::{ScreenshotItem, ScreenshotRect, ScreenshotTargets};
use super::windows::create_pin;
use super::{store, windows};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};
#[tauri::command]
pub fn screenshot_active() -> Option<String> {
    drafts().lock().ok()?.keys().next().cloned()
}

#[tauri::command]
pub async fn screenshot_begin(app: AppHandle) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err("Screenshots are only supported on Windows".into());
    }
    #[cfg(windows)]
    {
        if STARTING.swap(true, Ordering::AcqRel) {
            return Ok(());
        }
        let _starting = StartingGuard;
        // 同一时间只保留一张临时截图，忽略连续按键。
        {
            let state = drafts()
                .lock()
                .map_err(|_| "Screenshot state is unavailable")?;
            if !state.is_empty() {
                return Ok(());
            }
        }
        screenshot_prepare(app.clone()).await?;
        let mut draft_id = None;
        let result = (|| {
            let bounds = desktop_bounds()?;
            let targets = window_targets(&app, bounds);
            let id = format!(
                "{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            );
            draft_id = Some(id.clone());
            drafts()
                .lock()
                .map_err(|_| "Screenshot state is unavailable")?
                .insert(id.clone(), Draft { bounds, targets });

            let overlay = app
                .get_webview_window("screenshot-overlay")
                .ok_or("Screenshot window is unavailable")?;
            overlay
                .set_position(PhysicalPosition::new(bounds.x, bounds.y))
                .map_err(|e| e.to_string())?;
            overlay
                .set_size(PhysicalSize::new(bounds.width, bounds.height))
                .map_err(|e| e.to_string())?;
            overlay
                .emit("screenshot-start", &id)
                .map_err(|e| e.to_string())?;
            Ok(())
        })();
        if result.is_err() {
            if let Some(id) = draft_id {
                let _ = finish_draft(&app, &id);
            }
        }
        result
    }
}

#[tauri::command]
pub fn screenshot_targets(app: AppHandle, draft_id: String) -> Result<ScreenshotTargets, String> {
    let state = drafts()
        .lock()
        .map_err(|_| "Screenshot state is unavailable")?;
    let draft = state
        .get(&draft_id)
        .ok_or("Screenshot draft no longer exists")?;
    let overlay = app
        .get_webview_window("screenshot-overlay")
        .ok_or("Screenshot window is unavailable")?;
    let origin = overlay.inner_position().map_err(|e| e.to_string())?;
    let size = overlay.inner_size().map_err(|e| e.to_string())?;
    Ok(ScreenshotTargets {
        width: draft.bounds.width,
        height: draft.bounds.height,
        windows: draft.targets.clone(),
        viewport: ScreenshotRect {
            x: origin.x - draft.bounds.x,
            y: origin.y - draft.bounds.y,
            w: size.width as i32,
            h: size.height as i32,
        },
    })
}

/// 只有确认操作才捕获桌面；隐藏选区层并等待合成结束，避免边框和工具栏进入图片。
#[tauri::command]
pub async fn screenshot_capture(app: AppHandle, draft_id: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        let bounds = {
            let state = drafts()
                .lock()
                .map_err(|_| "Screenshot state is unavailable")?;
            state
                .get(&draft_id)
                .ok_or("Screenshot draft no longer exists")?
                .bounds
        };
        let current = desktop_bounds()?;
        if (bounds.x, bounds.y, bounds.width, bounds.height)
            != (current.x, current.y, current.width, current.height)
        {
            return Err("Display layout changed. Cancel and start a new screenshot".into());
        }
        let overlay = app
            .get_webview_window("screenshot-overlay")
            .ok_or("Screenshot window is unavailable")?;
        // hide() 会派发到窗口线程。必须等待该线程执行完毕，再让 DWM 完成合成。
        let (hidden_tx, hidden_rx) = std::sync::mpsc::channel();
        let hidden_overlay = overlay.clone();
        overlay
            .run_on_main_thread(move || {
                // 使用同步 Win32 调用，避免再次进入事件队列后过早确认隐藏完成。
                let result = hidden_overlay
                    .hwnd()
                    .map_err(|e| e.to_string())
                    .and_then(|hwnd| {
                        use windows_sys::Win32::UI::WindowsAndMessaging::{
                            IsWindowVisible, ShowWindow, SW_HIDE,
                        };
                        unsafe {
                            ShowWindow(hwnd.0 as _, SW_HIDE);
                            if IsWindowVisible(hwnd.0 as _) != 0 {
                                return Err("Can't hide the screenshot overlay".into());
                            }
                        }
                        Ok(())
                    });
                let _ = hidden_tx.send(result);
            })
            .map_err(|e| e.to_string())?;
        let result = tauri::async_runtime::spawn_blocking(move || {
            hidden_rx
                .recv_timeout(std::time::Duration::from_secs(3))
                .map_err(|_| "Timed out hiding the screenshot overlay".to_string())??;
            let flush = unsafe { windows_sys::Win32::Graphics::Dwm::DwmFlush() };
            if flush < 0 {
                return Err("Can't synchronize the desktop capture".into());
            }
            capture_desktop(bounds).map(|bytes| BASE64.encode(bytes))
        })
        .await
        .map_err(|e| e.to_string())
        .and_then(|value| value);
        if result.is_err() {
            let _ = overlay.show();
            let _ = overlay.set_focus();
        }
        result
    }
    #[cfg(not(windows))]
    Err("Screenshots are only supported on Windows".into())
}

#[tauri::command]
pub async fn screenshot_finish(
    app: AppHandle,
    draft_id: String,
    png_base64: String,
    pin: bool,
    copy_to_clipboard: bool,
) -> Result<ScreenshotItem, String> {
    let bytes = BASE64.decode(png_base64).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_PNG_SIZE || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Invalid screenshot PNG".into());
    }
    #[cfg(windows)]
    if copy_to_clipboard {
        let overlay = app
            .get_webview_window("screenshot-overlay")
            .ok_or("Screenshot window is unavailable")?;
        let hwnd = overlay.hwnd().map_err(|e| e.to_string())?;
        copy_screenshot(hwnd.0 as _, &bytes)?;
    }
    #[cfg(not(windows))]
    let (day, hour, stamp) = (
        "unknown".to_string(),
        "00".to_string(),
        format!("screenshot-{}", COUNTER.fetch_add(1, Ordering::Relaxed)),
    );
    #[cfg(windows)]
    let (day, hour, stamp) = local_stamp();
    let folder = screenshots_dir(&app)?.join(&day).join(&hour);
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let name = format!("{stamp}.png");
    let path = folder.join(&name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let id = format!("{day}/{hour}/{name}");
    let item = item_from_path(&day, &hour, &path).ok_or("Can't describe the saved screenshot")?;
    debug_assert_eq!(item.id, id);
    // 文件落盘后立即通知主窗口，后台截图和贴图操作也能同步到历史列表。
    let _ = app.emit_to("main", "screenshot-saved", &item);
    #[cfg(windows)]
    if pin {
        create_pin(&app, &id, &path)?;
    }
    finish_draft(&app, &draft_id)?;
    Ok(item)
}

#[tauri::command]
pub fn screenshot_cancel(app: AppHandle, draft_id: String) -> Result<(), String> {
    finish_draft(&app, &draft_id)
}

#[tauri::command]
pub async fn screenshot_prepare(app: AppHandle) -> Result<(), String> {
    windows::screenshot_prepare(app)
}

#[tauri::command]
pub fn screenshot_show(app: AppHandle, draft_id: String) -> Result<(), String> {
    windows::screenshot_show(app, draft_id)
}

#[tauri::command]
pub fn screenshot_list(app: AppHandle) -> Result<Vec<ScreenshotItem>, String> {
    store::screenshot_list(app)
}

#[tauri::command]
pub fn screenshot_read(app: AppHandle, id: String) -> Result<String, String> {
    store::screenshot_read(app, id)
}

#[tauri::command]
pub fn screenshot_delete(app: AppHandle, id: String) -> Result<(), String> {
    store::screenshot_delete(app, id)
}

#[tauri::command]
pub async fn screenshot_pin(app: AppHandle, id: String) -> Result<(), String> {
    windows::screenshot_pin(app, id)
}

#[tauri::command]
pub fn screenshot_reveal(app: AppHandle, id: String) -> Result<(), String> {
    store::screenshot_reveal(app, id)
}
