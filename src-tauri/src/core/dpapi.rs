use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

// 使用当前 Windows 用户的 DPAPI 保护本地数据。
pub(crate) fn protect(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(data.len())
            .map_err(|_| "The data is too large for Windows encryption")?,
        pbData: data.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let result = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                null(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                null_mut(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if result == 0 {
        return Err(if encrypt {
            "Can't encrypt local data"
        } else {
            "Can't decrypt local data"
        }
        .into());
    }
    if output.pbData.is_null() {
        return Err("Windows returned an empty local data blob".into());
    }
    let bytes = unsafe {
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData.cast());
        bytes
    };
    Ok(bytes)
}
