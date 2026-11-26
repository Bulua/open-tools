//! 笔记本文件只存放在应用数据目录，前端不能指定磁盘路径。
use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle,
};

use super::store;

#[tauri::command]
pub async fn notebook_read(app: AppHandle) -> Result<Option<String>, String> {
    store::read_snapshot(&app)
}

#[tauri::command]
pub async fn notebook_write(app: AppHandle, data: String) -> Result<(), String> {
    store::write_snapshot(&app, &data)
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
    store::save_image(&app, &id, data)
}

#[tauri::command]
pub async fn notebook_read_image(
    app: AppHandle,
    id: String,
    name: String,
) -> Result<Response, String> {
    store::read_image(&app, &id, &name).map(Response::new)
}

#[cfg(windows)]
#[tauri::command]
pub async fn notebook_reveal(app: AppHandle, id: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let (path, is_folder) = store::entry_path(&app, &id)?;
    if is_folder {
        app.opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
    } else {
        app.opener().reveal_item_in_dir(path)
    }
    .map_err(|e| e.to_string())
}
