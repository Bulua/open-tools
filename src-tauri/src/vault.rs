//! 密码本：加密后的内容保存在程序所在的文件夹（安装目录）里的 vault.dat。
//! 加密、解密都在前端用主密码完成，这里只负责读写文件，接触不到明文和主密码。

use std::path::PathBuf;

use serde::Serialize;

fn vault_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("找不到程序所在的文件夹：{e}"))?;
    let dir = exe.parent().ok_or("找不到程序所在的文件夹")?;
    Ok(dir.join("vault.dat"))
}

#[derive(Serialize)]
pub struct VaultFile {
    /// 文件位置，显示给用户
    path: String,
    /// 文件内容；还没有创建密码本时为空
    data: Option<String>,
}

#[tauri::command]
pub fn vault_read() -> Result<VaultFile, String> {
    let path = vault_path()?;
    let data = match std::fs::read_to_string(&path) {
        Ok(s) => Some(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("读取密码本失败：{e}")),
    };
    Ok(VaultFile { path: path.to_string_lossy().into_owned(), data })
}

/// 先写到临时文件再替换，写到一半断电也不会损坏原文件；替换前把原文件备份为 vault.dat.bak
#[tauri::command]
pub fn vault_write(data: String) -> Result<(), String> {
    let path = vault_path()?;
    let tmp = path.with_extension("dat.tmp");
    std::fs::write(&tmp, data).map_err(|e| format!("保存密码本失败：{e}"))?;
    if path.exists() {
        std::fs::copy(&path, path.with_extension("dat.bak")).map_err(|e| format!("备份密码本失败：{e}"))?;
    }
    std::fs::rename(&tmp, &path).map_err(|e| format!("保存密码本失败：{e}"))
}
