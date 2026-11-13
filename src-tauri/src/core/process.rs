//! 外部进程输出的通用解码，兼容中文 Windows 的 GBK 编码。

/// 中文 Windows 的命令行输出是 GBK 编码，不是 UTF-8 时按 GBK 解码
pub(crate) fn decode_output(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => encoding_rs::GBK.decode(bytes).0.into_owned(),
    }
}
