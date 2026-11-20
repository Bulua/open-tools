//! 笔记本文件只存放在应用数据目录，前端不能指定磁盘路径。
use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle,
};

use super::files;

static NOTEBOOK_IO: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[tauri::command]
pub async fn notebook_read(app: AppHandle) -> Result<Option<String>, String> {
    let dir = crate::core::paths::sub_dir(&app, "notebook")?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    files::read(&dir).map_err(|e| format!("Failed to read the notebook: {e}"))
}

#[tauri::command]
pub async fn notebook_write(app: AppHandle, data: String) -> Result<(), String> {
    let dir = crate::core::paths::sub_dir(&app, "notebook")?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    files::write(&dir, &data).map_err(|e| format!("Failed to save the notebook: {e}"))
}

#[tauri::command]
pub async fn notebook_save_image(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("Expected binary notebook image data".into());
    };
    let id = request
        .headers()
        .get("x-note-id")
        .and_then(|value| STANDARD.decode(value.as_bytes()).ok())
        .and_then(|value| String::from_utf8(value).ok())
        .ok_or("Missing or invalid notebook note ID")?;
    let dir = crate::core::paths::sub_dir(&app, "notebook")?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    files::save_image(&dir, &id, data).map_err(|e| format!("Failed to save notebook image: {e}"))
}

#[tauri::command]
pub async fn notebook_read_image(
    app: AppHandle,
    id: String,
    name: String,
) -> Result<Response, String> {
    let dir = crate::core::paths::sub_dir(&app, "notebook")?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    files::read_image(&dir, &id, &name)
        .map(Response::new)
        .map_err(|e| format!("Failed to read notebook image: {e}"))
}

#[cfg(windows)]
#[tauri::command]
pub async fn notebook_reveal(app: AppHandle, id: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = crate::core::paths::sub_dir(&app, "notebook")?;
    let (path, is_folder) = {
        let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
        files::entry_path(&dir, &id).map_err(|e| e.to_string())?
    };
    if is_folder {
        app.opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
    } else {
        app.opener().reveal_item_in_dir(path)
    }
    .map_err(|e| e.to_string())
}
