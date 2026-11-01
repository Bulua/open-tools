//! 文档转换：调用本机安装的 Word / WPS / LibreOffice 把文档转成 PDF，排版与在这些软件里「另存为 PDF」完全一致。
//! 转换脚本见 office_to_pdf.ps1；文件内容通过二进制请求体传入、传出，避免 JSON 编码大文件。

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use tauri::ipc::{InvokeBody, Request, Response};

use crate::script::{hide_window, run_powershell, TempDir};

const SCRIPT: &str = include_str!("office_to_pdf.ps1");
/// 单个文件的最长转换时间，超时后结束进程（例如文档打开时弹出了对话框）
const TIMEOUT: Duration = Duration::from_secs(180);
/// 允许转换的扩展名，同时防止通过文件头传入奇怪的路径
const EXTENSIONS: &[&str] = &["docx", "doc", "docm", "dotx", "dot", "rtf", "odt", "wps", "wpt", "txt"];

fn soffice_path() -> Option<PathBuf> {
    ["C:\\Program Files\\LibreOffice\\program\\soffice.exe", "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"]
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

fn convert(data: Vec<u8>, ext: &str) -> Result<Vec<u8>, String> {
    let dir = TempDir::new()?;
    let input = dir.join(&format!("document.{ext}"));
    let output = dir.join("document-output.pdf");
    std::fs::write(&input, data).map_err(|e| format!("无法写入临时文件：{e}"))?;

    let soffice = soffice_path().unwrap_or_default();
    let result = run_powershell(
        &dir,
        SCRIPT,
        &[("OT_IN", input.as_os_str()), ("OT_OUT", output.as_os_str()), ("OT_SOFFICE", soffice.as_os_str())],
        TIMEOUT,
        "转换超时：文档可能需要密码，或者 Word 弹出了需要处理的对话框",
    )?;
    let stdout = result.stdout;

    if output.exists() {
        return std::fs::read(&output).map_err(|e| format!("无法读取转换结果：{e}"));
    }
    if stdout.lines().any(|l| l.trim() == "NONE") {
        return Err("没有找到 Microsoft Word、WPS 或 LibreOffice，请安装其中之一后再转换".into());
    }
    let details: Vec<&str> = stdout.lines().filter_map(|l| l.trim().strip_prefix("ERR:")).collect();
    Err(if details.is_empty() {
        format!("转换失败：{}", result.stderr.trim())
    } else {
        format!("转换失败：{}", details.join("；"))
    })
}

/// 把文档转换为 PDF。请求体是文档内容，请求头 x-file-ext 是扩展名；返回 PDF 内容
#[tauri::command]
pub async fn office_to_pdf(request: Request<'_>) -> Result<Response, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("请求格式不正确".into());
    };
    let ext = request
        .headers()
        .get("x-file-ext")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("docx")
        .to_ascii_lowercase();
    if !EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("不支持 .{ext} 格式"));
    }
    let data = data.clone();
    let pdf = tauri::async_runtime::spawn_blocking(move || convert(data, &ext))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Response::new(pdf))
}
