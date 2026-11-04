//! 密码本：加密后的内容保存在数据文件夹（见 core/paths.rs，Windows 上是安装目录下的 data）里的 vault.dat。
//! 加密、解密都在前端用主密码完成，这里只负责读写文件，接触不到明文和主密码。

use std::path::PathBuf;

use serde::Serialize;
use tauri::AppHandle;

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::core::paths::data_dir(app)?.join("vault.dat"))
}

#[derive(Serialize)]
pub struct VaultFile {
    /// 文件位置，显示给用户
    path: String,
    /// 文件内容；还没有创建密码本时为空
    data: Option<String>,
}

#[tauri::command]
pub fn vault_read(app: AppHandle) -> Result<VaultFile, String> {
    let path = vault_path(&app)?;
    let data = match std::fs::read_to_string(&path) {
        Ok(s) => Some(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("Failed to read the vault: {e}")),
    };
    Ok(VaultFile { path: path.to_string_lossy().into_owned(), data })
}

/// 先写到临时文件再替换，写到一半断电也不会损坏原文件；替换前把原文件备份为 vault.dat.bak
#[tauri::command]
pub fn vault_write(app: AppHandle, data: String) -> Result<(), String> {
    let path = vault_path(&app)?;
    let tmp = path.with_extension("dat.tmp");
    std::fs::write(&tmp, data).map_err(|e| format!("Failed to save the vault: {e}"))?;
    if path.exists() {
        std::fs::copy(&path, path.with_extension("dat.bak")).map_err(|e| format!("Failed to back up the vault: {e}"))?;
    }
    std::fs::rename(&tmp, &path).map_err(|e| format!("Failed to save the vault: {e}"))
}
