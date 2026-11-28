//! 时钟提醒 Tauri IPC 命令入口（统一返回 `{ code, msg, data }` 响应结构）。

use tauri::State;

use crate::core::db::Database;
use crate::core::error::{api_result, ApiResult};

use super::store::{self, CountdownItem};

#[tauri::command]
pub(crate) async fn clock_list(db: State<'_, Database>) -> ApiResult<Vec<CountdownItem>> {
    api_result(store::list_items(db.inner()).await)
}

#[tauri::command]
pub(crate) async fn clock_upsert(
    db: State<'_, Database>,
    item: CountdownItem,
) -> ApiResult<Vec<CountdownItem>> {
    api_result(store::upsert_item(db.inner(), item).await)
}

#[tauri::command]
pub(crate) async fn clock_delete(
    db: State<'_, Database>,
    id: String,
) -> ApiResult<Vec<CountdownItem>> {
    api_result(store::delete_item(db.inner(), id).await)
}
