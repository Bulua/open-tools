//! 时钟提醒命令层：读写均委托给 `store`，与 AI 工具共享同一把互斥锁。

use tauri::AppHandle;

use super::store;

/// 读取倒计时与闹钟列表；还没有保存过时返回空。
#[tauri::command]
pub fn countdown_read(app: AppHandle) -> Result<Option<String>, String> {
    store::read_snapshot(&app)
}

/// 原子写回倒计时与闹钟列表。
#[tauri::command]
pub fn countdown_write(app: AppHandle, data: String) -> Result<(), String> {
    store::write_snapshot(&app, &data)
}
