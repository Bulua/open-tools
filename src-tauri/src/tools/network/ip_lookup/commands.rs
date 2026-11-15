//! IP 查询工具需要的本机局域网 IP。
use std::net::UdpSocket;

/// 本机的局域网 IP：向外部地址「连接」一个 UDP 套接字（不会真正发送数据），读取系统选择的本地地址
#[tauri::command]
pub fn local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}
