//! 多个工具共用的 Windows 原生桌面通知。
use crate::core::error::{api_result, ApiResult, AppError, AppResult};
use tauri::AppHandle;

pub(crate) fn send_desktop_notify(app: &AppHandle, title: &str, body: &str) -> AppResult<()> {
    // 开发版和安装版都使用安装时注册的应用标识。
    tauri_winrt_notification::Toast::new(&app.config().identifier)
        .title(title)
        .text1(body)
        .show()
        .map_err(|error| AppError::internal(error.to_string()))
}

#[tauri::command]
pub fn desktop_notify(app: AppHandle, title: String, body: String) -> ApiResult<()> {
    api_result(send_desktop_notify(&app, &title, &body))
}
