//! 日历备注保存在程序数据目录中，Windows 提醒通过系统通知显示。

use std::path::PathBuf;

use tauri::AppHandle;

#[cfg(windows)]
static REMINDER_WAKE: (std::sync::Mutex<u32>, std::sync::Condvar) =
    (std::sync::Mutex::new(0), std::sync::Condvar::new());

fn notes_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::core::paths::data_dir(app)?.join("calendar-notes.json"))
}

#[tauri::command]
pub fn calendar_read(app: AppHandle) -> Result<Option<String>, String> {
    match std::fs::read_to_string(notes_path(&app)?) {
        Ok(data) => Ok(Some(data)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read calendar notes: {error}")),
    }
}

#[tauri::command]
pub fn calendar_write(app: AppHandle, data: String) -> Result<(), String> {
    let path = notes_path(&app)?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, data)
        .map_err(|error| format!("Failed to save calendar notes: {error}"))?;
    std::fs::rename(temp, path).map_err(|error| format!("Failed to save calendar notes: {error}"))
}

#[cfg(windows)]
#[tauri::command]
pub async fn calendar_wait(delay_ms: u64, revision: u32) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (state, changed) = &REMINDER_WAKE;
        let current = state.lock().map_err(|error| error.to_string())?;
        let (current, _) = changed
            .wait_timeout_while(
                current,
                std::time::Duration::from_millis(delay_ms.clamp(1, 30_000)),
                |current| *current == revision,
            )
            .map_err(|error| error.to_string())?;
        Ok(*current)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(windows)]
#[tauri::command]
pub fn calendar_wake() -> Result<(), String> {
    let (state, changed) = &REMINDER_WAKE;
    let mut revision = state.lock().map_err(|error| error.to_string())?;
    // 若重新安排发生在两次等待之间，下一次等待也要立即返回。
    *revision = revision.wrapping_add(1);
    changed.notify_all();
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub fn calendar_notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    // 开发版和安装版都使用安装时注册的应用标识。
    tauri_winrt_notification::Toast::new(&app.config().identifier)
        .title(&title)
        .text1(&body)
        .show()
        .map_err(|error| error.to_string())
}
