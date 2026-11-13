//! Word/WPS 文档转 PDF 的工具命令。
use super::super::shared::conversion::run_conversion;
use tauri::ipc::{InvokeBody, Request, Response};
const SCRIPT: &str = include_str!("office_to_pdf.ps1");

/// 允许转换的扩展名，同时防止通过文件头传入奇怪的路径
const EXTENSIONS: &[&str] = &[
    "docx", "doc", "docm", "dotx", "dot", "rtf", "odt", "wps", "wpt", "txt",
];

fn convert(data: Vec<u8>, ext: &str) -> Result<Vec<u8>, String> {
    run_conversion(
        data,
        ext,
        "pdf",
        SCRIPT,
        "Conversion timed out: the document may need a password, or Word is showing a dialog",
        "Microsoft Word, WPS or LibreOffice was not found. Install one of them and try again",
    )
}

/// 把文档转换为 PDF。请求体是文档内容，请求头 x-file-ext 是扩展名；返回 PDF 内容
#[tauri::command]
pub async fn office_to_pdf(request: Request<'_>) -> Result<Response, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("Invalid request".into());
    };
    let ext = request
        .headers()
        .get("x-file-ext")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("docx")
        .to_ascii_lowercase();
    if !EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("Unsupported format: .{ext}"));
    }
    let data = data.clone();
    let pdf = tauri::async_runtime::spawn_blocking(move || convert(data, &ext))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Response::new(pdf))
}
