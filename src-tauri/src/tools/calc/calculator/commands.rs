//! 计算器 Tauri 命令层，供前端页面直接复用后端求值器。

use super::eval::{evaluate, AngleUnit, EvalResult};
use super::store::{
    self, CalculatorHistoryImportItem, CalculatorHistoryItem,
};
use crate::core::db::Database;
use crate::core::error::{api_result, ApiResult, AppError};

#[tauri::command]
pub fn calculator_eval(expression: String, angle: Option<String>) -> ApiResult<EvalResult> {
    let res = (|| -> Result<EvalResult, String> {
        let unit = AngleUnit::parse(angle.as_deref())?;
        Ok(evaluate(&expression, unit))
    })();
    api_result(res.map_err(AppError::from))
}

#[tauri::command]
pub(crate) async fn calculator_history_list(
    db: tauri::State<'_, Database>,
) -> ApiResult<Vec<CalculatorHistoryItem>> {
    api_result(store::list_history(db.inner()).await)
}

#[tauri::command]
pub(crate) async fn calculator_history_add(
    db: tauri::State<'_, Database>,
    expression: String,
    result: String,
    angle_unit: Option<String>,
) -> ApiResult<Vec<CalculatorHistoryItem>> {
    api_result(store::add_history(db.inner(), expression, result, angle_unit).await)
}

#[tauri::command]
pub(crate) async fn calculator_history_import(
    db: tauri::State<'_, Database>,
    items: Vec<CalculatorHistoryImportItem>,
) -> ApiResult<Vec<CalculatorHistoryItem>> {
    api_result(store::import_history(db.inner(), items).await)
}

#[tauri::command]
pub(crate) async fn calculator_history_delete(
    db: tauri::State<'_, Database>,
    id: String,
) -> ApiResult<Vec<CalculatorHistoryItem>> {
    api_result(store::delete_history(db.inner(), id).await)
}

#[tauri::command]
pub(crate) async fn calculator_history_clear(db: tauri::State<'_, Database>) -> ApiResult<()> {
    api_result(store::clear_history(db.inner()).await)
}
