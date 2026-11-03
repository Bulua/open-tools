//! 远程图标：前端从 Gitee / GitHub 读取仓库里的 branding/icon.json，下载并校验好图标后交给这里。
//! 这里负责把图标保存到本机、换上窗口和托盘图标、改写快捷方式的图标；下次启动时直接换上保存的图标。
//! 图标保存在应用数据目录的 branding 文件夹：<id>.png、<id>.ico，current.txt 记录正在使用的图标 id。

use std::path::PathBuf;

use tauri::image::Image;
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, Runtime};

/// 单个图标文件的大小上限
const MAX_SIZE: usize = 2 * 1024 * 1024;

fn branding_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("branding");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Can't create the icon folder: {e}"))?;
    Ok(dir)
}

/// 图标 id 会拼进文件名，只允许小写字母、数字和连字符
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// 正在使用的远程图标；用的是程序自带的图标时为空
fn current_id<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let text = std::fs::read_to_string(branding_dir(app).ok()?.join("current.txt")).ok()?;
    let id = text.trim().to_string();
    valid_id(&id).then_some(id)
}

/// 换上窗口（标题栏、任务栏、Alt+Tab）和托盘的图标
fn set_icon<R: Runtime>(app: &AppHandle<R>, icon: Image<'_>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_icon(icon.clone());
    }
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_icon(Some(icon));
    }
}

/// 启动时换上上次保存的图标，并确认快捷方式也指向它（重新安装程序会把快捷方式的图标改回去）
pub fn apply_cached<R: Runtime>(app: &AppHandle<R>) {
    let Some(id) = current_id(app) else { return };
    let Ok(dir) = branding_dir(app) else { return };
    let Ok(bytes) = std::fs::read(dir.join(format!("{id}.png"))) else { return };
    let Ok(icon) = Image::from_bytes(&bytes) else { return };
    set_icon(app, icon);
    let ico = dir.join(format!("{id}.ico"));
    tauri::async_runtime::spawn_blocking(move || update_shortcuts(Some(ico)));
}

/// 正在使用的远程图标 id，前端据此判断要不要下载
#[tauri::command]
pub fn branding_current(app: AppHandle) -> Option<String> {
    current_id(&app)
}

/// 正在使用的远程图标（PNG），给顶栏的 Logo 用；用的是自带图标时返回空
#[tauri::command]
pub fn branding_logo(app: AppHandle) -> Response {
    let bytes = current_id(&app)
        .and_then(|id| std::fs::read(branding_dir(&app).ok()?.join(format!("{id}.png"))).ok())
        .unwrap_or_default();
    Response::new(bytes)
}

/// 换上图标。id 为空时换回程序自带的图标；png、ico 是前端下载并核对过校验值的文件内容
#[tauri::command]
pub fn branding_activate(app: AppHandle, id: Option<String>, png: Vec<u8>, ico: Vec<u8>) -> Result<(), String> {
    let dir = branding_dir(&app)?;
    let ico_path = match &id {
        Some(id) => {
            if !valid_id(id) {
                return Err(format!("Invalid icon id: {id}"));
            }
            if png.len() > MAX_SIZE || ico.len() > MAX_SIZE {
                return Err("The icon file is too large".into());
            }
            // ICO 文件以 00 00 01 00 开头
            if !ico.starts_with(&[0, 0, 1, 0]) {
                return Err("The icon is not a valid ICO file".into());
            }
            let icon = Image::from_bytes(&png).map_err(|e| format!("The icon is not a valid PNG file: {e}"))?;
            let ico_path = dir.join(format!("{id}.ico"));
            std::fs::write(dir.join(format!("{id}.png")), &png).map_err(|e| format!("Can't save the icon: {e}"))?;
            std::fs::write(&ico_path, &ico).map_err(|e| format!("Can't save the icon: {e}"))?;
            std::fs::write(dir.join("current.txt"), id).map_err(|e| format!("Can't save the icon: {e}"))?;
            set_icon(&app, icon);
            Some(ico_path)
        }
        None => {
            let _ = std::fs::remove_file(dir.join("current.txt"));
            if let Some(icon) = app.default_window_icon().cloned() {
                set_icon(&app, icon);
            }
            None
        }
    };
    // 改写快捷方式要一两秒，放到后台；之后删掉不再使用的旧图标
    tauri::async_runtime::spawn_blocking(move || {
        update_shortcuts(ico_path);
        remove_unused(&dir, id.as_deref());
    });
    Ok(())
}

/// 删除除了 keep 以外的已下载图标
fn remove_unused(dir: &std::path::Path, keep: Option<&str>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_icon = matches!(path.extension().and_then(|e| e.to_str()), Some("png" | "ico"));
        let stem = path.file_stem().and_then(|s| s.to_str());
        if is_icon && stem != keep {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// 让桌面、开始菜单、固定到任务栏的快捷方式使用 ico 这个图标；为空时用程序自带的图标
#[cfg(windows)]
fn update_shortcuts(ico: Option<PathBuf>) {
    use crate::script::{run_powershell, TempDir};
    const SCRIPT: &str = include_str!("shortcut_icon.ps1");

    let Ok(exe) = std::env::current_exe() else { return };
    let Ok(dir) = TempDir::new() else { return };
    let icon = ico.map(PathBuf::into_os_string).unwrap_or_default();
    let _ = run_powershell(
        &dir,
        SCRIPT,
        &[("OT_EXE", exe.as_os_str()), ("OT_ICON", icon.as_os_str())],
        std::time::Duration::from_secs(60),
        "Timed out updating shortcuts",
    );
}

#[cfg(not(windows))]
fn update_shortcuts(_: Option<PathBuf>) {}

#[cfg(test)]
mod tests {
    use super::valid_id;

    #[test]
    fn id_rules() {
        assert!(valid_id("orange-2026"));
        assert!(!valid_id(""));
        assert!(!valid_id("Orange"));
        assert!(!valid_id("../evil"));
        assert!(!valid_id("a.b"));
    }
}
