use super::fonts;
use crate::core::error::{api_result, ApiResult, AppError};
use base64::Engine;
use tauri::WebviewWindow;

fn authorize(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("System fonts are only available in the main window".into())
    }
}

#[tauri::command]
pub async fn pdf_system_fonts(window: WebviewWindow) -> ApiResult<Vec<fonts::FontInfo>> {
    let res = async {
        authorize(&window)?;
        tauri::async_runtime::spawn_blocking(fonts::list)
            .await
            .map_err(|e| e.to_string())?
    }
    .await;
    api_result(res.map_err(AppError::from))
}

#[tauri::command]
pub async fn pdf_system_font_read(window: WebviewWindow, id: usize) -> ApiResult<String> {
    let res = async {
        authorize(&window)?;
        tauri::async_runtime::spawn_blocking(move || {
            fonts::read(id).map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes))
        })
        .await
        .map_err(|e| e.to_string())?
    }
    .await;
    api_result(res.map_err(AppError::from))
}
