//! 通用文档转换流程：写入临时文件、执行脚本、读取结果和处理错误。
use super::office::soffice_path;
use crate::core::script::{run_powershell, TempDir};
use std::time::Duration;
/// 单个文件的最长转换时间，超时后结束进程（例如文档打开时弹出了对话框）
const TIMEOUT: Duration = Duration::from_secs(180);

/// 把文件写入临时文件夹，运行转换脚本，读取输出文件；none_message 是脚本报告没有可用软件时的提示
pub(crate) fn run_conversion(
    data: Vec<u8>,
    in_ext: &str,
    out_ext: &str,
    script: &str,
    timeout_message: &str,
    none_message: &str,
) -> Result<Vec<u8>, String> {
    let dir = TempDir::new()?;
    let input = dir.join(&format!("document.{in_ext}"));
    let output = dir.join(&format!("document-output.{out_ext}"));
    std::fs::write(&input, data).map_err(|e| format!("Can't write a temporary file: {e}"))?;

    let soffice = soffice_path().unwrap_or_default();
    let result = run_powershell(
        &dir,
        script,
        &[
            ("OT_IN", input.as_os_str()),
            ("OT_OUT", output.as_os_str()),
            ("OT_SOFFICE", soffice.as_os_str()),
        ],
        TIMEOUT,
        timeout_message,
    )?;
    let stdout = result.stdout;

    if output.exists() {
        return std::fs::read(&output)
            .map_err(|e| format!("Can't read the conversion result: {e}"));
    }
    if stdout.lines().any(|l| l.trim() == "NONE") {
        return Err(none_message.into());
    }
    let details: Vec<&str> = stdout
        .lines()
        .filter_map(|l| l.trim().strip_prefix("ERR:"))
        .collect();
    Err(if details.is_empty() {
        format!("Conversion failed: {}", result.stderr.trim())
    } else {
        format!("Conversion failed: {}", details.join("; "))
    })
}
