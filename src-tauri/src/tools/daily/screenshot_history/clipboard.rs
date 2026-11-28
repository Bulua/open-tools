//! 将截图写入 Windows 剪贴板。

#[cfg(windows)]
pub(super) fn copy_screenshot(
    hwnd: windows_sys::Win32::Foundation::HWND,
    png: &[u8],
) -> Result<(), String> {
    use windows_sys::Win32::Foundation::GlobalFree;
    use windows_sys::Win32::Graphics::Gdi::{BITMAPINFOHEADER, BI_RGB};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT,
    };
    use windows_sys::Win32::System::Ole::CF_DIB;

    let image = tauri::image::Image::from_bytes(png).map_err(|e| e.to_string())?;
    let header_size = std::mem::size_of::<BITMAPINFOHEADER>();
    let header = BITMAPINFOHEADER {
        biSize: header_size as u32,
        biWidth: image.width() as i32,
        biHeight: image.height() as i32,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB,
        ..Default::default()
    };
    let memory = unsafe {
        GlobalAlloc(
            GMEM_MOVEABLE | GMEM_ZEROINIT,
            header_size + image.rgba().len(),
        )
    };
    if memory.is_null() {
        return Err("Can't allocate screenshot clipboard data".into());
    }
    let result = (|| {
        let data = unsafe { GlobalLock(memory) }.cast::<u8>();
        if data.is_null() {
            return Err("Can't access screenshot clipboard data".into());
        }
        unsafe {
            data.cast::<BITMAPINFOHEADER>().write(header);
            let pixels = std::slice::from_raw_parts_mut(data.add(header_size), image.rgba().len());
            // CF_DIB 的正高度表示像素从底行开始排列，每像素按 BGRA 写入。
            let row_bytes = image.width() as usize * 4;
            let source_rows = image.rgba().chunks_exact(row_bytes).rev();
            for (source, target) in source_rows.zip(pixels.chunks_exact_mut(row_bytes)) {
                for (rgba, bgra) in source.chunks_exact(4).zip(target.chunks_exact_mut(4)) {
                    bgra.copy_from_slice(&[rgba[2], rgba[1], rgba[0], rgba[3]]);
                }
            }
            GlobalUnlock(memory);
        }
        // 剪贴板管理器等应用可能短暂占用剪贴板。
        for attempt in 0..10 {
            if unsafe { OpenClipboard(hwnd) } != 0 {
                let copied = unsafe {
                    let copied = EmptyClipboard() != 0
                        && !SetClipboardData(u32::from(CF_DIB), memory).is_null();
                    CloseClipboard();
                    copied
                };
                return if copied {
                    Ok(())
                } else {
                    Err("Can't copy screenshot to the clipboard".into())
                };
            }
            if attempt < 9 {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        }
        Err("The Windows clipboard is busy. Try again".into())
    })();
    // 写入成功后由系统接管这块内存。
    if result.is_err() {
        unsafe {
            GlobalFree(memory);
        }
    }
    result
}
