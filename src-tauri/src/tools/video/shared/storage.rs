//! 下载作品统一存入程序数据目录，只开放已注册平台的下载文件夹。

use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

#[tauri::command]
pub fn video_download_dir(app: AppHandle, platform: String) -> Result<String, String> {
    if !matches!(platform.as_str(), "douyin" | "bilibili" | "xhs" | "x") {
        return Err("Invalid video platform".into());
    }
    let dir = crate::core::paths::sub_dir(&app, &format!("videos/{platform}"))?;
    app.fs_scope()
        .allow_directory(&dir, false)
        .map_err(|e| e.to_string())?;
    // 让播放器直接读取已下载文件，支持拖动进度且不必把整段视频留在内存中。
    app.asset_protocol_scope()
        .allow_directory(&dir, false)
        .map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}
