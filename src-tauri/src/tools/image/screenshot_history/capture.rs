//! Windows GDI 捕获、DPI 上下文与可捕获窗口枚举。
use super::types::{CaptureBounds, ScreenshotRect};
use tauri::{AppHandle, Manager};
/// DWM 边界使用物理像素；避免后台线程上的 Win32 调用被 DPI 虚拟化。
#[cfg(windows)]
struct PhysicalDpi(windows_sys::Win32::UI::HiDpi::DPI_AWARENESS_CONTEXT);

#[cfg(windows)]
impl PhysicalDpi {
    fn enter() -> Self {
        use windows_sys::Win32::UI::HiDpi::{
            SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        };
        Self(unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) })
    }
}

#[cfg(windows)]
impl Drop for PhysicalDpi {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                windows_sys::Win32::UI::HiDpi::SetThreadDpiAwarenessContext(self.0);
            }
        }
    }
}

/// 按窗口层叠顺序收集可见窗口；坐标统一为截图内的物理像素。
#[cfg(windows)]
pub(super) fn window_targets(app: &AppHandle, bounds: CaptureBounds) -> Vec<ScreenshotRect> {
    let _dpi = PhysicalDpi::enter();
    use windows_sys::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Dwm::{
        DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowRect, IsIconic, IsWindowVisible,
    };

    struct Targets {
        windows: Vec<RECT>,
        excluded: Vec<usize>,
    }

    unsafe extern "system" fn visit(hwnd: HWND, param: LPARAM) -> i32 {
        let targets = &mut *(param as *mut Targets);
        if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return 1;
        }
        // 主窗口也可被框选，只排除截图层和已排除捕获的贴图窗口。
        if targets.excluded.contains(&(hwnd as usize)) {
            return 1;
        }
        let mut cloaked = 0u32;
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED as u32,
            (&mut cloaked as *mut u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
        if cloaked != 0 {
            return 1;
        }
        let mut rect = RECT::default();
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS as u32,
            (&mut rect as *mut RECT).cast(),
            std::mem::size_of::<RECT>() as u32,
        ) < 0
        {
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return 1;
            }
        }
        if rect.right > rect.left && rect.bottom > rect.top {
            targets.windows.push(rect);
        }
        1
    }

    let mut targets = Targets {
        windows: Vec::new(),
        excluded: app
            .webview_windows()
            .into_iter()
            .filter(|(label, _)| label.starts_with("screenshot-"))
            .filter_map(|(_, window)| window.hwnd().ok().map(|hwnd| hwnd.0 as usize))
            .collect(),
    };
    unsafe {
        EnumWindows(Some(visit), (&mut targets as *mut Targets) as LPARAM);
    }
    targets
        .windows
        .into_iter()
        .filter_map(|rect| {
            let x = (rect.left - bounds.x).max(0);
            let y = (rect.top - bounds.y).max(0);
            let right = (rect.right - bounds.x).min(bounds.width as i32);
            let bottom = (rect.bottom - bounds.y).min(bounds.height as i32);
            (right > x && bottom > y).then_some(ScreenshotRect {
                x,
                y,
                w: right - x,
                h: bottom - y,
            })
        })
        .collect()
}

#[cfg(windows)]
pub(super) fn desktop_bounds() -> Result<CaptureBounds, String> {
    let _dpi = PhysicalDpi::enter();
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    };
    let bounds = CaptureBounds {
        x: unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) },
        y: unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) },
        width: unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) }.max(0) as u32,
        height: unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) }.max(0) as u32,
    };
    if bounds.width == 0 || bounds.height == 0 {
        return Err("Can't determine the desktop size".into());
    }
    Ok(bounds)
}

#[cfg(windows)]
pub(super) fn capture_desktop(bounds: CaptureBounds) -> Result<Vec<u8>, String> {
    let _dpi = PhysicalDpi::enter();
    use std::mem::size_of;
    use std::ptr::null_mut;
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
        DIB_RGB_COLORS, SRCCOPY,
    };
    let (x, y) = (bounds.x, bounds.y);
    let (width, height) = (bounds.width as i32, bounds.height as i32);

    let screen = unsafe { GetDC(null_mut()) };
    if screen.is_null() {
        return Err("Can't access the desktop".into());
    }
    let memory = unsafe { CreateCompatibleDC(screen) };
    if memory.is_null() {
        unsafe { ReleaseDC(null_mut(), screen) };
        return Err("Can't create the capture context".into());
    }
    let bitmap = unsafe { CreateCompatibleBitmap(screen, width, height) };
    if bitmap.is_null() {
        unsafe {
            DeleteDC(memory);
            ReleaseDC(null_mut(), screen);
        }
        return Err("Can't create the capture bitmap".into());
    }
    let old = unsafe { SelectObject(memory, bitmap as _) };
    let copied = unsafe {
        BitBlt(
            memory,
            0,
            0,
            width,
            height,
            screen,
            x,
            y,
            SRCCOPY | CAPTUREBLT,
        )
    };
    if copied == 0 {
        unsafe {
            SelectObject(memory, old);
            DeleteObject(bitmap as _);
            DeleteDC(memory);
            ReleaseDC(null_mut(), screen);
        }
        return Err("Can't capture the desktop".into());
    }

    let mut info = BITMAPINFO::default();
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: width,
        biHeight: -height,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB,
        ..Default::default()
    };
    let mut bgra = vec![0u8; width as usize * height as usize * 4];
    // GetDIBits 要求位图不能仍被选入设备上下文。
    unsafe {
        SelectObject(memory, old);
    }
    let rows = unsafe {
        GetDIBits(
            memory,
            bitmap,
            0,
            height as u32,
            bgra.as_mut_ptr().cast(),
            &mut info,
            DIB_RGB_COLORS,
        )
    };
    unsafe {
        SelectObject(memory, old);
        DeleteObject(bitmap as _);
        DeleteDC(memory);
        ReleaseDC(null_mut(), screen);
    }
    if rows != height {
        return Err("Can't read the captured pixels".into());
    }
    for pixel in bgra.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }
    let mut png = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png, width as u32, height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        // 选区预览优先响应速度，最终 PNG 仍由前端导出。
        encoder.set_compression(png::Compression::Fast);
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(&bgra).map_err(|e| e.to_string())?;
    }
    Ok(png)
}
