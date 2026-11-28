//! HTTP 请求历史 Tauri IPC 命令入口。

use crate::core::db::Database;
use crate::core::error::{api_result, ApiResult};

use super::store::{self, HttpHistoryRecord, HttpHistorySaveInput};

#[tauri::command]
pub(crate) async fn http_history_list(
    db: tauri::State<'_, Database>,
) -> ApiResult<Vec<HttpHistoryRecord>> {
    api_result(store::list_history(db.inner()).await)
}

#[tauri::command]
pub(crate) async fn http_history_save(
    db: tauri::State<'_, Database>,
    input: HttpHistorySaveInput,
) -> ApiResult<Vec<HttpHistoryRecord>> {
    api_result(store::save_history(db.inner(), input).await)
}

#[tauri::command]
pub(crate) async fn http_history_import(
    db: tauri::State<'_, Database>,
    entries: Vec<HttpHistorySaveInput>,
) -> ApiResult<Vec<HttpHistoryRecord>> {
    api_result(store::import_history(db.inner(), entries).await)
}

#[tauri::command]
pub(crate) async fn http_history_delete(
    db: tauri::State<'_, Database>,
    id: String,
) -> ApiResult<Vec<HttpHistoryRecord>> {
    api_result(store::delete_history(db.inner(), id).await)
}

#[tauri::command]
pub(crate) async fn http_history_clear(db: tauri::State<'_, Database>) -> ApiResult<()> {
    api_result(store::clear_history(db.inner()).await)
}
