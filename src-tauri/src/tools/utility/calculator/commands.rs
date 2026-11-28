//! 计算器 Tauri 命令层，供前端页面直接复用后端求值器。

use super::eval::{evaluate, AngleUnit, EvalResult};
use crate::core::error::{api_result, ApiResult, AppError};

#[tauri::command]
pub fn calculator_eval(expression: String, angle: Option<String>) -> ApiResult<EvalResult> {
    let res = (|| -> Result<EvalResult, String> {
        let unit = AngleUnit::parse(angle.as_deref())?;
        Ok(evaluate(&expression, unit))
    })();
    api_result(res.map_err(AppError::from))
}
