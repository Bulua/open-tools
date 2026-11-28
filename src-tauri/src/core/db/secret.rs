//! 数据库敏感字段加解密与哈希辅助（Windows 使用当前用户 DPAPI，跨平台回退为明文兼容编译）。

#[cfg(windows)]
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};

#[cfg(not(windows))]
use crate::core::error::AppError;
use crate::core::error::AppResult;

const DPAPI_PREFIX: &str = "dpapi:";

/// 使用当前 Windows 用户 DPAPI 加密敏感字符串；空串直接返回空串。
pub(crate) fn encrypt_secret(plain: &str) -> AppResult<String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    #[cfg(windows)]
    {
        let encrypted = crate::core::dpapi::protect(plain.as_bytes(), true)?;
        Ok(format!("{DPAPI_PREFIX}{}", STANDARD.encode(encrypted)))
    }
    #[cfg(not(windows))]
    {
        Ok(plain.to_string())
    }
}

/// 解密数据库中的敏感字符串；若未带 DPAPI 前缀则按明文兼容返回。
pub(crate) fn decrypt_secret(stored: &str) -> AppResult<String> {
    if stored.is_empty() {
        return Ok(String::new());
    }
    if let Some(encoded) = stored.strip_prefix(DPAPI_PREFIX) {
        #[cfg(windows)]
        {
            let raw = STANDARD.decode(encoded).map_err(|err| {
                crate::core::error::AppError::io(format!(
                    "Could not decode encrypted database field: {err}"
                ))
            })?;
            let plain = crate::core::dpapi::protect(&raw, false)?;
            return String::from_utf8(plain).map_err(|err| {
                crate::core::error::AppError::io(format!(
                    "Encrypted database field is not valid UTF-8: {err}"
                ))
            });
        }
        #[cfg(not(windows))]
        {
            let _ = encoded;
            return Err(AppError::internal(
                "Encrypted fields protected by Windows DPAPI cannot be decrypted on this platform.",
            ));
        }
    }
    Ok(stored.to_string())
}

/// 生成小写十六进制 SHA-256 摘要，用于敏感值的去重索引。
pub(crate) fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
