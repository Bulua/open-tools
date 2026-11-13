//! 检测本机可用的 Office 转换引擎，供文档转换工具共用。
use crate::core::script::hide_window;
use std::path::PathBuf;
use std::process::{Command, Stdio};
pub(super) fn soffice_path() -> Option<PathBuf> {
    [
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ]
    .iter()
    .map(PathBuf::from)
    .find(|p| p.exists())
}

/// 注册表中是否有这个 COM 组件（即是否安装了对应软件）
fn has_com(prog_id: &str) -> bool {
    let mut cmd = Command::new("reg");
    hide_window(&mut cmd);
    cmd.args(["query", &format!("HKCR\\{prog_id}\\CLSID")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// 本机可用于转换的软件，按尝试顺序排列
#[tauri::command]
pub async fn office_engines() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut engines = Vec::new();
        if has_com("Word.Application") {
            engines.push("Microsoft Word".to_string());
        }
        if has_com("KWps.Application") {
            engines.push("WPS".to_string());
        }
        if soffice_path().is_some() {
            engines.push("LibreOffice".to_string());
        }
        engines
    })
    .await
    .unwrap_or_default()
}
