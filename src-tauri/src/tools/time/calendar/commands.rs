//! 日历备注与提醒 Tauri IPC 命令入口（统一返回 `{ code, msg, data }` 响应结构）。

use tauri::{AppHandle, State};

use crate::core::db::Database;
use crate::core::error::{api_result, ApiResult, AppError};

use super::store::{self, CalendarNoteDto, CalendarNoteUpsertInput};

#[cfg(windows)]
static REMINDER_WAKE: (std::sync::Mutex<u32>, std::sync::Condvar) =
    (std::sync::Mutex::new(0), std::sync::Condvar::new());

#[tauri::command]
pub(crate) async fn calendar_list_notes(
    db: State<'_, Database>,
) -> ApiResult<Vec<CalendarNoteDto>> {
    api_result(store::list_notes(db.inner()).await)
}

#[tauri::command]
pub(crate) async fn calendar_upsert_note(
    db: State<'_, Database>,
    input: CalendarNoteUpsertInput,
) -> ApiResult<CalendarNoteDto> {
    api_result(store::upsert_note(db.inner(), input).await)
}

#[tauri::command]
pub(crate) async fn calendar_delete_note(
    db: State<'_, Database>,
    date: String,
) -> ApiResult<()> {
    api_result(store::delete_note(db.inner(), date).await)
}

#[cfg(windows)]
#[tauri::command]
pub(crate) async fn calendar_wait(delay_ms: u64, revision: u32) -> ApiResult<u32> {
    let res = tauri::async_runtime::spawn_blocking(move || {
        let (state, changed) = &REMINDER_WAKE;
        let current = state
            .lock()
            .map_err(|error| AppError::internal(error.to_string()))?;
        let (current, _) = changed
            .wait_timeout_while(
                current,
                std::time::Duration::from_millis(delay_ms.clamp(1, 30_000)),
                |current| *current == revision,
            )
            .map_err(|error| AppError::internal(error.to_string()))?;
        Ok(*current)
    })
    .await
    .map_err(|error| AppError::internal(error.to_string()))
    .and_then(|inner| inner);
    api_result(res)
}

#[cfg(windows)]
#[tauri::command]
pub(crate) fn calendar_wake() -> ApiResult<()> {
    let res = (|| {
        let (state, changed) = &REMINDER_WAKE;
        let mut revision = state
            .lock()
            .map_err(|error| AppError::internal(error.to_string()))?;
        // 若重新安排发生在两次等待之间，下一次等待也要立即返回。
        *revision = revision.wrapping_add(1);
        changed.notify_all();
        Ok(())
    })();
    api_result(res)
}

#[cfg(windows)]
#[tauri::command]
pub(crate) fn calendar_notify(app: AppHandle, title: String, body: String) -> ApiResult<()> {
    api_result(crate::core::notifications::send_desktop_notify(&app, &title, &body))
}
