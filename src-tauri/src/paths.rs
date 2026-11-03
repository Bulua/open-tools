//! 程序数据的存放位置：密码本、倒计时、AI 模型与运行环境、远程图标等都放在这里。
//! - Windows：安装目录下的 data 文件夹，跟着程序走；安装目录没有写权限（如装在 Program Files）时，
//!   退回到系统给程序的数据目录（%LOCALAPPDATA%\com.opentools.app）
//! - 其他平台（以后的安卓、苹果等）不能往安装位置写文件，直接用系统给程序的数据目录
//!
//! 界面设置（主题、语言等）由 WebView2 保存在它自己的数据目录里，不在这里。

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager, Runtime};

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// 数据文件夹（第一次调用时确定，之后不变）
pub fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if let Some(dir) = DATA_DIR.get() {
        return Ok(dir.clone());
    }
    let dir = pick_data_dir(app)?;
    Ok(DATA_DIR.get_or_init(|| dir).clone())
}

/// 数据文件夹下的子文件夹，不存在时创建
pub fn sub_dir<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join(name);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Can't create the folder {}: {e}", dir.display()))?;
    Ok(dir)
}

#[cfg(windows)]
fn pick_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if let Some(dir) = install_dir().map(|d| d.join("data")) {
        if writable(&dir) {
            return Ok(dir);
        }
    }
    system_data_dir(app)
}

#[cfg(not(windows))]
fn pick_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    system_data_dir(app)
}

fn system_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Can't create the data folder: {e}"))?;
    Ok(dir)
}

/// 程序所在的文件夹（安装目录）
fn install_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

/// 能否在这个文件夹里创建文件（不存在时先创建文件夹）
#[cfg(windows)]
fn writable(dir: &Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-test");
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

/// 把旧版本放在别处的数据搬进数据文件夹：安装目录下的密码本，以及系统数据目录下的模型和图标。
/// 新位置已经有同名文件时不覆盖，旧文件留在原处。启动时调用一次。
pub fn migrate<R: Runtime>(app: &AppHandle<R>) {
    let Ok(data) = data_dir(app) else { return };
    if let Some(install) = install_dir() {
        for name in ["vault.dat", "vault.dat.bak"] {
            move_file(&install.join(name), &data.join(name));
        }
    }
    if let Ok(old) = app.path().app_local_data_dir() {
        if old != data {
            for name in ["models", "branding"] {
                move_dir(&old.join(name), &data.join(name));
            }
        }
    }
}

fn move_file(from: &Path, to: &Path) {
    if !from.is_file() || to.exists() {
        return;
    }
    if let Some(parent) = to.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if std::fs::rename(from, to).is_ok() {
        return;
    }
    // 不在同一个磁盘时不能直接改名：先复制，确认完整后再删除旧文件
    let size = std::fs::metadata(from).map(|m| m.len()).ok();
    if std::fs::copy(from, to).ok() == size {
        let _ = std::fs::remove_file(from);
    } else {
        let _ = std::fs::remove_file(to);
    }
}

/// 逐个搬动文件夹里的文件（不含子文件夹），搬完后删除空的旧文件夹
fn move_dir(from: &Path, to: &Path) {
    let Ok(entries) = std::fs::read_dir(from) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            move_file(&path, &to.join(entry.file_name()));
        }
    }
    let _ = std::fs::remove_dir(from);
}

#[cfg(test)]
mod tests {
    use super::move_dir;

    #[test]
    fn move_dir_keeps_existing_files() {
        let root = std::env::temp_dir().join(format!("open-tools-paths-test-{}", std::process::id()));
        let (from, to) = (root.join("old"), root.join("new"));
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        std::fs::write(from.join("a.onnx"), b"old a").unwrap();
        std::fs::write(from.join("b.onnx"), b"old b").unwrap();
        std::fs::write(to.join("b.onnx"), b"new b").unwrap();

        move_dir(&from, &to);
        assert_eq!(std::fs::read(to.join("a.onnx")).unwrap(), b"old a");
        // 新位置已有的文件不覆盖，旧文件留在原处
        assert_eq!(std::fs::read(to.join("b.onnx")).unwrap(), b"new b");
        assert!(from.join("b.onnx").exists());
        assert!(!from.join("a.onnx").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
