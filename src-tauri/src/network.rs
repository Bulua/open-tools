//! 网络相关命令：ping、本机局域网 IP。
//! 浏览器里无法发送 ICMP，所以 ping 调用系统自带的 ping 命令，把输出交给前端解析。

use std::net::UdpSocket;
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

/// 中文 Windows 的命令行输出是 GBK 编码，不是 UTF-8 时按 GBK 解码
pub(crate) fn decode_output(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => encoding_rs::GBK.decode(bytes).0.into_owned(),
    }
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

/// 本机的局域网 IP：向外部地址「连接」一个 UDP 套接字（不会真正发送数据），读取系统选择的本地地址
#[tauri::command]
pub fn local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}
