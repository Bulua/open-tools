//! Word 转 Markdown 的二进制 IPC 入口，避免大文件序列化为数字数组。
use super::converter;
use crate::core::error::AppError;
use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::ipc::{InvokeBody, Request, Response};

#[tauri::command]
pub async fn word_to_markdown(request: Request<'_>) -> Result<Response, AppError> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err(AppError::invalid_input("Invalid request"));
    };
    if data.len() > converter::MAX_INPUT {
        return Err(AppError::invalid_input(
            "Word file exceeds the 64 MB size limit",
        ));
    }
    let ext = request
        .headers()
        .get("x-file-ext")
        .and_then(|s| s.to_str().ok())
        .unwrap_or("docx")
        .to_ascii_lowercase();
    if ext != "docx" {
        return Err(AppError::invalid_input("Only DOCX files are supported"));
    }
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|s| s.to_str().ok())
        .filter(|s| s.len() <= 2048)
        .and_then(|s| STANDARD.decode(s).ok())
        .and_then(|s| String::from_utf8(s).ok())
        .unwrap_or_else(|| "document.docx".into());
    let data = data.clone();
    let result = tauri::async_runtime::spawn_blocking(move || converter::convert(data, &name))
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .map_err(AppError::from)?;
    Ok(Response::new(result))
}
