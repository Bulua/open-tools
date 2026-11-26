//! 身份证号解析 Tauri 命令，供前端界面直接调用后端统一解析器。

use super::parser::{parse_id_card, IdParseResult};

/// 批量解析身份证号（支持实时渐进输入与历史列表汇总）。
#[tauri::command]
pub fn id_card_parse(inputs: Vec<String>) -> Vec<IdParseResult> {
    inputs
        .iter()
        .map(|input| parse_id_card(input))
        .collect()
}
