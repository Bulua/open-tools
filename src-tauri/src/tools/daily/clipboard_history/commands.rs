//! Windows 剪贴板历史 Tauri IPC 命令入口（统一返回 `{ code, msg, data }` 响应结构）。

use tauri::{Manager, State, WebviewWindow};

use crate::core::db::Database;
use crate::core::error::{api_result, ApiResult};

use super::service::{
    apply_update, authorize, copy_entry, copy_private, list_snapshot, open, ClipboardRuntime,
    Snapshot, Update,
};

#[tauri::command]
pub(crate) async fn clipboard_history_list(
    window: WebviewWindow,
    db: State<'_, Database>,
    runtime: State<'_, ClipboardRuntime>,
    query: String,
) -> ApiResult<Snapshot> {
    api_result(async {
        authorize(&window)?;
        list_snapshot(db.inner(), runtime.inner(), query).await
    }.await)
}

#[tauri::command]
pub(crate) async fn clipboard_history_update(
    window: WebviewWindow,
    db: State<'_, Database>,
    runtime: State<'_, ClipboardRuntime>,
    action: Update,
) -> ApiResult<()> {
    api_result(async {
        authorize(&window)?;
        apply_update(window.app_handle(), db.inner(), runtime.inner(), action).await
    }.await)
}

#[tauri::command]
pub(crate) async fn clipboard_history_copy(
    window: WebviewWindow,
    db: State<'_, Database>,
    id: String,
) -> ApiResult<()> {
    api_result(copy_entry(&window, db.inner(), id).await)
}

#[tauri::command]
pub(crate) async fn clipboard_copy_private(
    window: WebviewWindow,
    text: String,
) -> ApiResult<()> {
    api_result(copy_private(&window, &text))
}

#[tauri::command]
pub(crate) async fn clipboard_history_open(window: WebviewWindow) -> ApiResult<()> {
    api_result((|| {
        authorize(&window)?;
        open(window.app_handle())
    })())
}
