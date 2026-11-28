//! 身份证号解析 Tauri 命令，供前端界面直接调用后端统一解析器。

use super::parser::{parse_id_card, IdParseResult};
use super::store;
use crate::core::db::Database;
use crate::core::error::{api_ok, api_result, ApiResult};

/// 批量解析身份证号（支持实时渐进输入与历史列表汇总）。
#[tauri::command]
pub fn id_card_parse(inputs: Vec<String>) -> ApiResult<Vec<IdParseResult>> {
    api_ok(inputs.iter().map(|input| parse_id_card(input)).collect())
}

#[tauri::command]
pub(crate) async fn id_card_history_list(
    db: tauri::State<'_, Database>,
) -> ApiResult<Vec<String>> {
    api_result(store::list_history(db.inner()).await)
}

#[tauri::command]
pub(crate) async fn id_card_history_add(
    db: tauri::State<'_, Database>,
    id_number: String,
) -> ApiResult<Vec<String>> {
    api_result(store::add_history(db.inner(), id_number).await)
}

#[tauri::command]
pub(crate) async fn id_card_history_import(
    db: tauri::State<'_, Database>,
    id_numbers: Vec<String>,
) -> ApiResult<Vec<String>> {
    api_result(store::import_history(db.inner(), id_numbers).await)
}

#[tauri::command]
pub(crate) async fn id_card_history_delete(
    db: tauri::State<'_, Database>,
    id_number: String,
) -> ApiResult<Vec<String>> {
    api_result(store::delete_history(db.inner(), id_number).await)
}

#[tauri::command]
pub(crate) async fn id_card_history_clear(db: tauri::State<'_, Database>) -> ApiResult<()> {
    api_result(store::clear_history(db.inner()).await)
}
