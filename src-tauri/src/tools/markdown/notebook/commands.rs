//! 笔记本文件只存放在应用数据目录，前端不能指定磁盘路径。
use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle,
};

use crate::core::error::{api_result, ApiResult, AppError};

use super::store;

#[tauri::command]
pub async fn notebook_read(app: AppHandle) -> ApiResult<Option<String>> {
    api_result(store::read_snapshot(&app).map_err(AppError::from))
}

#[tauri::command]
pub async fn notebook_write(app: AppHandle, data: String) -> ApiResult<()> {
    api_result(store::write_snapshot(&app, &data).map_err(AppError::from))
}

#[tauri::command]
pub async fn notebook_save_image(app: AppHandle, request: Request<'_>) -> ApiResult<String> {
    let InvokeBody::Raw(data) = request.body() else {
        return api_result(Err(AppError::invalid_input(
            "Expected binary notebook image data",
        )));
    };
    let Some(id) = request
        .headers()
        .get("x-note-id")
        .and_then(|value| STANDARD.decode(value.as_bytes()).ok())
        .and_then(|value| String::from_utf8(value).ok())
    else {
        return api_result(Err(AppError::invalid_input(
            "Missing or invalid notebook note ID",
        )));
    };
    api_result(store::save_image(&app, &id, data).map_err(AppError::from))
}

#[tauri::command]
pub async fn notebook_read_image(
    app: AppHandle,
    id: String,
    name: String,
) -> Result<Response, AppError> {
    store::read_image(&app, &id, &name)
        .map(Response::new)
        .map_err(AppError::from)
}

#[cfg(windows)]
#[tauri::command]
pub async fn notebook_reveal(app: AppHandle, id: String) -> ApiResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let res = (|| -> Result<(), String> {
        let (path, is_folder) = store::entry_path(&app, &id)?;
        if is_folder {
            app.opener()
                .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        } else {
            app.opener().reveal_item_in_dir(path)
        }
        .map_err(|e| e.to_string())
    })();
    api_result(res.map_err(AppError::from))
}
