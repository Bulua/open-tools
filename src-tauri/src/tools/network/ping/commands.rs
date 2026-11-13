//! 调用系统 Ping 命令，将原始输出交给前端解析。
use crate::core::process::decode_output;
use std::process::Command;
/// 只允许域名、IPv4、IPv6 的字符，且不能以 - 开头，防止被当成 ping 的参数
fn is_valid_host(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= 253
        && !host.starts_with('-')
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':')
}

fn run_ping(host: &str, timeout_ms: u32) -> Result<String, String> {
    if !is_valid_host(host) {
        return Err("Invalid address".into());
    }
    let mut cmd = Command::new("ping");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW：不弹出命令行窗口
        cmd.creation_flags(0x0800_0000);
        cmd.args(["-n", "1", "-w", &timeout_ms.to_string(), host]);
    }
    #[cfg(not(windows))]
    {
        let seconds = (timeout_ms / 1000).max(1);
        cmd.args(["-c", "1", "-W", &seconds.to_string(), host]);
    }

    let output = cmd.output().map_err(|e| format!("Can't run ping: {e}"))?;
    let mut bytes = output.stdout;
    bytes.extend_from_slice(&output.stderr);
    Ok(decode_output(&bytes))
}

/// ping 一次，返回系统 ping 命令的原始输出
#[tauri::command]
pub async fn ping_once(host: String, timeout_ms: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || run_ping(host.trim(), timeout_ms))
        .await
        .map_err(|e| e.to_string())?
}
