//! 多个工具共用的 Windows 原生桌面通知。
use tauri::AppHandle;

#[tauri::command]
pub fn desktop_notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    // 开发版和安装版都使用安装时注册的应用标识。
    tauri_winrt_notification::Toast::new(&app.config().identifier)
        .title(&title)
        .text1(&body)
        .show()
        .map_err(|error| error.to_string())
}
