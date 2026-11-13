//! 调用 Microsoft Word 将 PDF 转换为可编辑的 Word 文档。
use super::super::shared::conversion::run_conversion;
use tauri::ipc::{InvokeBody, Request, Response};
const PDF_TO_WORD_SCRIPT: &str = include_str!("pdf_to_word.ps1");

/// 用 Word 把 PDF 转换为 .docx。请求体是 PDF 内容；返回 .docx 内容
#[tauri::command]
pub async fn pdf_to_word(request: Request<'_>) -> Result<Response, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("Invalid request".into());
    };
    let data = data.clone();
    let docx = tauri::async_runtime::spawn_blocking(move || {
        run_conversion(
            data,
            "pdf",
            "docx",
            PDF_TO_WORD_SCRIPT,
            "Conversion timed out: the PDF may need a password or have too many pages, or Word is showing a dialog",
            "Microsoft Word (2013 or later) was not found",
        )
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(Response::new(docx))
}
