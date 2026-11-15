//! 截图草稿、并发保护和草稿生命周期。
use super::types::{CaptureBounds, ScreenshotRect};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager, Runtime};
pub(super) static DRAFTS: OnceLock<Mutex<HashMap<String, Draft>>> = OnceLock::new();

pub(super) static COUNTER: AtomicU64 = AtomicU64::new(1);

pub(super) static STARTING: AtomicBool = AtomicBool::new(false);

/// 在捕获和窗口定位期间合并重复快捷键，错误返回时也自动解锁。
pub(super) struct StartingGuard;

impl Drop for StartingGuard {
    fn drop(&mut self) {
        STARTING.store(false, Ordering::Release);
    }
}

pub(super) struct Draft {
    pub(super) bounds: CaptureBounds,
    pub(super) targets: Vec<ScreenshotRect>,
}

pub(super) fn drafts() -> &'static Mutex<HashMap<String, Draft>> {
    DRAFTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) fn finish_draft<R: Runtime>(app: &AppHandle<R>, draft_id: &str) -> Result<(), String> {
    drafts()
        .lock()
        .map_err(|_| "Screenshot state is unavailable")?
        .remove(draft_id);
    if let Some(overlay) = app.get_webview_window("screenshot-overlay") {
        let _ = overlay.hide();
    }
    Ok(())
}
