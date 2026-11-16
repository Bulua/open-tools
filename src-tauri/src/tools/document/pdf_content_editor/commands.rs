use super::fonts;
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
pub async fn pdf_system_fonts(window: WebviewWindow) -> Result<Vec<fonts::FontInfo>, String> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(fonts::list)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pdf_system_font_read(window: WebviewWindow, id: usize) -> Result<String, String> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        fonts::read(id).map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}
