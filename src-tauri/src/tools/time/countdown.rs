//! 倒计时：列表以 JSON 保存在数据文件夹（见 core/paths.rs，Windows 上是安装目录下的 data）里的 countdowns.json。
//! 内容由前端整理好，这里只负责读写文件。

use std::path::PathBuf;

use tauri::AppHandle;

fn countdown_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::core::paths::data_dir(app)?.join("countdowns.json"))
}

/// 读取倒计时文件；还没有保存过时返回空
#[tauri::command]
pub fn countdown_read(app: AppHandle) -> Result<Option<String>, String> {
    match std::fs::read_to_string(countdown_path(&app)?) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Failed to read the countdowns: {e}")),
    }
}

/// 先写到临时文件再替换，写到一半断电也不会损坏原文件
#[tauri::command]
pub fn countdown_write(app: AppHandle, data: String) -> Result<(), String> {
    let path = countdown_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, data).map_err(|e| format!("Failed to save the countdowns: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("Failed to save the countdowns: {e}"))
}
