/// 移动端没有系统托盘，保留空命令让前端切换语言时可以共用同一套调用。
#[tauri::command]
pub fn set_tray_text(show: String, quit: String, tooltip: String) {
    let _ = (show, quit, tooltip);
}
