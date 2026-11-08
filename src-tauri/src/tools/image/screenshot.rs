//! Windows 区域截图、历史截图与桌面贴图。
//! 原始桌面由 GDI 捕获；选区和标注在前端完成，最终 PNG 保存在 data/screenshots/日期/小时。

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindowBuilder,
    Window, WindowEvent,
};

use crate::core::paths;

const MAX_PNG_SIZE: usize = 100 * 1024 * 1024;
static DRAFTS: OnceLock<Mutex<HashMap<String, Draft>>> = OnceLock::new();
static COUNTER: AtomicU64 = AtomicU64::new(1);
static STARTING: AtomicBool = AtomicBool::new(false);

/// 在捕获和窗口定位期间合并重复快捷键，错误返回时也自动解锁。
struct StartingGuard;
impl Drop for StartingGuard {
    fn drop(&mut self) {
        STARTING.store(false, Ordering::Release);
    }
}

struct Draft {
    bounds: CaptureBounds,
    targets: Vec<ScreenshotRect>,
}

#[derive(Serialize)]
pub struct ScreenshotTargets {
    width: u32,
    height: u32,
    windows: Vec<ScreenshotRect>,
    viewport: ScreenshotRect,
}

/// DWM 边界使用物理像素；避免后台线程上的 Win32 调用被 DPI 虚拟化。
#[cfg(windows)]
struct PhysicalDpi(windows_sys::Win32::UI::HiDpi::DPI_AWARENESS_CONTEXT);
#[cfg(windows)]
impl PhysicalDpi {
    fn enter() -> Self {
        use windows_sys::Win32::UI::HiDpi::{SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2};
        Self(unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) })
    }
}
#[cfg(windows)]
impl Drop for PhysicalDpi {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { windows_sys::Win32::UI::HiDpi::SetThreadDpiAwarenessContext(self.0); }
        }
    }
}

#[derive(Clone, Serialize)]
pub struct ScreenshotRect {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

/// 按窗口层叠顺序收集可见窗口；坐标统一为截图内的物理像素。
#[cfg(windows)]
fn window_targets(app: &AppHandle, bounds: CaptureBounds) -> Vec<ScreenshotRect> {
    let _dpi = PhysicalDpi::enter();
    use windows_sys::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows_sys::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowRect, IsIconic, IsWindowVisible};

    struct Targets {
        windows: Vec<RECT>,
        excluded: Vec<usize>,
    }

    unsafe extern "system" fn visit(hwnd: HWND, param: LPARAM) -> i32 {
        let targets = &mut *(param as *mut Targets);
        if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 { return 1; }
        // 主窗口也可被框选，只排除截图层和已排除捕获的贴图窗口。
        if targets.excluded.contains(&(hwnd as usize)) { return 1; }
        let mut cloaked = 0u32;
        DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED as u32, (&mut cloaked as *mut u32).cast(), std::mem::size_of::<u32>() as u32);
        if cloaked != 0 { return 1; }
        let mut rect = RECT::default();
        if DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS as u32, (&mut rect as *mut RECT).cast(), std::mem::size_of::<RECT>() as u32) < 0 {
            if GetWindowRect(hwnd, &mut rect) == 0 { return 1; }
        }
        if rect.right > rect.left && rect.bottom > rect.top { targets.windows.push(rect); }
        1
    }

    let mut targets = Targets {
        windows: Vec::new(),
        excluded: app.webview_windows().into_iter()
            .filter(|(label, _)| label.starts_with("screenshot-"))
            .filter_map(|(_, window)| window.hwnd().ok().map(|hwnd| hwnd.0 as usize))
            .collect(),
    };
    unsafe { EnumWindows(Some(visit), (&mut targets as *mut Targets) as LPARAM); }
    targets.windows.into_iter().filter_map(|rect| {
        let x = (rect.left - bounds.x).max(0);
        let y = (rect.top - bounds.y).max(0);
        let right = (rect.right - bounds.x).min(bounds.width as i32);
        let bottom = (rect.bottom - bounds.y).min(bounds.height as i32);
        (right > x && bottom > y).then_some(ScreenshotRect { x, y, w: right - x, h: bottom - y })
    }).collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotItem {
    id: String,
    name: String,
    created_at: String,
    day: String,
    hour: String,
}

#[derive(Clone, Copy)]
struct CaptureBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn screenshots_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    paths::sub_dir(app, "screenshots")
}

fn drafts() -> &'static Mutex<HashMap<String, Draft>> {
    DRAFTS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(windows)]
fn local_stamp() -> (String, String, String) {
    use windows_sys::Win32::Foundation::SYSTEMTIME;
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;
    let mut time = SYSTEMTIME::default();
    unsafe { GetLocalTime(&mut time) };
    let day = format!("{:04}-{:02}-{:02}", time.wYear, time.wMonth, time.wDay);
    let hour = format!("{:02}", time.wHour);
    let stamp = format!(
        "{}_{:02}-{:02}-{:02}-{:03}",
        day, time.wHour, time.wMinute, time.wSecond, time.wMilliseconds
    );
    (day, hour, stamp)
}

fn safe_item_path<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<PathBuf, String> {
    if id.len() > 120 || !id.ends_with(".png") {
        return Err("Invalid screenshot id".into());
    }
    let path = Path::new(id);
    let parts: Vec<_> = path.components().collect();
    if parts.len() != 3
        || parts
            .iter()
            .any(|part| !matches!(part, Component::Normal(_)))
        || id
            .chars()
            .any(|ch| !(ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '/' | '\\')))
    {
        return Err("Invalid screenshot id".into());
    }
    Ok(screenshots_dir(app)?.join(path))
}

#[cfg(windows)]
fn desktop_bounds() -> Result<CaptureBounds, String> {
    let _dpi = PhysicalDpi::enter();
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };
    let bounds = CaptureBounds {
        x: unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) },
        y: unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) },
        width: unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) }.max(0) as u32,
        height: unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) }.max(0) as u32,
    };
    if bounds.width == 0 || bounds.height == 0 { return Err("Can't determine the desktop size".into()); }
    Ok(bounds)
}

#[cfg(windows)]
fn capture_desktop(bounds: CaptureBounds) -> Result<Vec<u8>, String> {
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
    unsafe { SelectObject(memory, old); }
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

#[tauri::command]
pub async fn screenshot_prepare(app: AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    if app.get_webview_window("screenshot-overlay").is_none() {
        WebviewWindowBuilder::new(&app, "screenshot-overlay", WebviewUrl::App("index.html?window=screenshot-overlay".into()))
            .title("Open Tools Screenshot")
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .content_protected(true)
            .background_color(tauri::window::Color(0, 0, 0, 0))
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .inner_size(800.0, 600.0)
            .build()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn screenshot_active() -> Option<String> {
    drafts().lock().ok()?.keys().next().cloned()
}

/// 前端准备好透明选区层后显示，不改变原有桌面内容。
#[tauri::command]
pub fn screenshot_show(app: AppHandle, draft_id: String) -> Result<(), String> {
    let active = drafts().lock().map_err(|_| "Screenshot state is unavailable")?.contains_key(&draft_id);
    if active {
        let overlay = app.get_webview_window("screenshot-overlay").ok_or("Screenshot window is unavailable")?;
        overlay.show().map_err(|e| e.to_string())?;
        overlay.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn screenshot_begin(app: AppHandle) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err("Screenshots are only supported on Windows".into());
    }
    #[cfg(windows)]
    {
        if STARTING.swap(true, Ordering::AcqRel) {
            return Ok(());
        }
        let _starting = StartingGuard;
        // 同一时间只保留一张临时截图，忽略连续按键。
        {
            let state = drafts().lock().map_err(|_| "Screenshot state is unavailable")?;
            if !state.is_empty() {
                return Ok(());
            }
        }
        screenshot_prepare(app.clone()).await?;
        let mut draft_id = None;
        let result = (|| {
            let bounds = desktop_bounds()?;
            let targets = window_targets(&app, bounds);
            let id = format!(
                "{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            );
            draft_id = Some(id.clone());
            drafts()
                .lock()
                .map_err(|_| "Screenshot state is unavailable")?
                .insert(
                    id.clone(),
                    Draft {
                        bounds,
                        targets,
                    },
                );

            let overlay = app.get_webview_window("screenshot-overlay").ok_or("Screenshot window is unavailable")?;
            overlay
                .set_position(PhysicalPosition::new(bounds.x, bounds.y))
                .map_err(|e| e.to_string())?;
            overlay
                .set_size(PhysicalSize::new(bounds.width, bounds.height))
                .map_err(|e| e.to_string())?;
            overlay.emit("screenshot-start", &id).map_err(|e| e.to_string())?;
            Ok(())
        })();
        if result.is_err() {
            if let Some(id) = draft_id {
                let _ = finish_draft(&app, &id);
            }
        }
        result
    }
}

#[tauri::command]
pub fn screenshot_targets(app: AppHandle, draft_id: String) -> Result<ScreenshotTargets, String> {
    let state = drafts().lock().map_err(|_| "Screenshot state is unavailable")?;
    let draft = state.get(&draft_id).ok_or("Screenshot draft no longer exists")?;
    let overlay = app.get_webview_window("screenshot-overlay").ok_or("Screenshot window is unavailable")?;
    let origin = overlay.inner_position().map_err(|e| e.to_string())?;
    let size = overlay.inner_size().map_err(|e| e.to_string())?;
    Ok(ScreenshotTargets {
        width: draft.bounds.width, height: draft.bounds.height, windows: draft.targets.clone(),
        viewport: ScreenshotRect { x: origin.x - draft.bounds.x, y: origin.y - draft.bounds.y, w: size.width as i32, h: size.height as i32 },
    })
}

/// 只有确认操作才捕获桌面；隐藏选区层并等待合成结束，避免边框和工具栏进入图片。
#[tauri::command]
pub async fn screenshot_capture(app: AppHandle, draft_id: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        let bounds = {
            let state = drafts().lock().map_err(|_| "Screenshot state is unavailable")?;
            state.get(&draft_id).ok_or("Screenshot draft no longer exists")?.bounds
        };
        let current = desktop_bounds()?;
        if (bounds.x, bounds.y, bounds.width, bounds.height) != (current.x, current.y, current.width, current.height) {
            return Err("Display layout changed. Cancel and start a new screenshot".into());
        }
        let overlay = app.get_webview_window("screenshot-overlay").ok_or("Screenshot window is unavailable")?;
        // hide() 会派发到窗口线程。必须等待该线程执行完毕，再让 DWM 完成合成。
        let (hidden_tx, hidden_rx) = std::sync::mpsc::channel();
        let hidden_overlay = overlay.clone();
        overlay.run_on_main_thread(move || {
            // 使用同步 Win32 调用，避免再次进入事件队列后过早确认隐藏完成。
            let result = hidden_overlay.hwnd().map_err(|e| e.to_string()).and_then(|hwnd| {
                use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, IsWindowVisible, SW_HIDE};
                unsafe {
                    ShowWindow(hwnd.0 as _, SW_HIDE);
                    if IsWindowVisible(hwnd.0 as _) != 0 { return Err("Can't hide the screenshot overlay".into()); }
                }
                Ok(())
            });
            let _ = hidden_tx.send(result);
        }).map_err(|e| e.to_string())?;
        let result = tauri::async_runtime::spawn_blocking(move || {
            hidden_rx.recv_timeout(std::time::Duration::from_secs(3))
                .map_err(|_| "Timed out hiding the screenshot overlay".to_string())??;
            let flush = unsafe { windows_sys::Win32::Graphics::Dwm::DwmFlush() };
            if flush < 0 { return Err("Can't synchronize the desktop capture".into()); }
            capture_desktop(bounds).map(|bytes| BASE64.encode(bytes))
        }).await.map_err(|e| e.to_string()).and_then(|value| value);
        if result.is_err() { let _ = overlay.show(); let _ = overlay.set_focus(); }
        result
    }
    #[cfg(not(windows))]
    Err("Screenshots are only supported on Windows".into())
}

fn finish_draft<R: Runtime>(app: &AppHandle<R>, draft_id: &str) -> Result<(), String> {
    drafts()
        .lock()
        .map_err(|_| "Screenshot state is unavailable")?
        .remove(draft_id);
    if let Some(overlay) = app.get_webview_window("screenshot-overlay") {
        let _ = overlay.hide();
    }
    Ok(())
}

#[cfg(windows)]
fn png_dimensions(path: &Path) -> Option<(u32, u32)> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    Some((
        u32::from_be_bytes(bytes[16..20].try_into().ok()?),
        u32::from_be_bytes(bytes[20..24].try_into().ok()?),
    ))
}

#[cfg(windows)]
fn create_pin<R: Runtime>(app: &AppHandle<R>, id: &str, path: &Path) -> Result<(), String> {
    let (width, height) = png_dimensions(path).unwrap_or((480, 320));
    let scale = (720.0 / width as f64).min(540.0 / height as f64).min(1.0);
    let window_width = (width as f64 * scale).max(180.0);
    let window_height = (height as f64 * scale).max(100.0);
    let label = format!("screenshot-pin-{}", COUNTER.fetch_add(1, Ordering::Relaxed));
    let url = WebviewUrl::App(format!("index.html?window=screenshot-pin&id={id}").into());
    WebviewWindowBuilder::new(app, label, url)
        .title("Open Tools Pin")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .content_protected(true)
        .resizable(true)
        .inner_size(window_width, window_height)
        .min_inner_size(140.0, 80.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn screenshot_finish(
    app: AppHandle,
    draft_id: String,
    png_base64: String,
    pin: bool,
) -> Result<ScreenshotItem, String> {
    let bytes = BASE64.decode(png_base64).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_PNG_SIZE || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Invalid screenshot PNG".into());
    }
    #[cfg(not(windows))]
    let (day, hour, stamp) = (
        "unknown".to_string(),
        "00".to_string(),
        format!("screenshot-{}", COUNTER.fetch_add(1, Ordering::Relaxed)),
    );
    #[cfg(windows)]
    let (day, hour, stamp) = local_stamp();
    let folder = screenshots_dir(&app)?.join(&day).join(&hour);
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let name = format!("{stamp}.png");
    let path = folder.join(&name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let id = format!("{day}/{hour}/{name}");
    let item = item_from_path(&day, &hour, &path).ok_or("Can't describe the saved screenshot")?;
    debug_assert_eq!(item.id, id);
    // 文件落盘后立即通知主窗口，后台截图和贴图操作也能同步到历史列表。
    let _ = app.emit_to("main", "screenshot-saved", &item);
    #[cfg(windows)]
    if pin {
        create_pin(&app, &id, &path)?;
    }
    finish_draft(&app, &draft_id)?;
    Ok(item)
}

#[tauri::command]
pub fn screenshot_cancel(app: AppHandle, draft_id: String) -> Result<(), String> {
    finish_draft(&app, &draft_id)
}

fn item_from_path(day: &str, hour: &str, path: &Path) -> Option<ScreenshotItem> {
    let name = path.file_name()?.to_str()?.to_string();
    if !name.ends_with(".png") {
        return None;
    }
    let raw = name.strip_suffix(".png")?;
    let created_at = if raw.len() >= 19 {
        format!(
            "{} {}:{}:{}",
            &raw[0..10],
            &raw[11..13],
            &raw[14..16],
            &raw[17..19]
        )
    } else {
        raw.to_string()
    };
    Some(ScreenshotItem {
        id: format!("{day}/{hour}/{name}"),
        name,
        created_at,
        day: day.into(),
        hour: hour.into(),
    })
}

#[tauri::command]
pub fn screenshot_list(app: AppHandle) -> Result<Vec<ScreenshotItem>, String> {
    let root = screenshots_dir(&app)?;
    let mut items = Vec::new();
    let days = std::fs::read_dir(root).map_err(|e| e.to_string())?;
    for day in days
        .flatten()
        .filter(|entry| entry.path().is_dir() && entry.file_name() != ".draft")
    {
        let Some(day_name) = day.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Ok(hours) = std::fs::read_dir(day.path()) else {
            continue;
        };
        for hour in hours.flatten().filter(|entry| entry.path().is_dir()) {
            let Some(hour_name) = hour.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let Ok(files) = std::fs::read_dir(hour.path()) else {
                continue;
            };
            items.extend(
                files
                    .flatten()
                    .filter_map(|entry| item_from_path(&day_name, &hour_name, &entry.path())),
            );
        }
    }
    items.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(items)
}

#[tauri::command]
pub fn screenshot_read(app: AppHandle, id: String) -> Result<String, String> {
    let bytes = std::fs::read(safe_item_path(&app, &id)?).map_err(|e| e.to_string())?;
    Ok(BASE64.encode(bytes))
}

#[tauri::command]
pub fn screenshot_delete(app: AppHandle, id: String) -> Result<(), String> {
    std::fs::remove_file(safe_item_path(&app, &id)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn screenshot_pin(app: AppHandle, id: String) -> Result<(), String> {
    let path = safe_item_path(&app, &id)?;
    if !path.is_file() {
        return Err("Screenshot not found".into());
    }
    #[cfg(windows)]
    return create_pin(&app, &id, &path);
    #[cfg(not(windows))]
    Err("Screenshot pins are only supported on Windows".into())
}

#[tauri::command]
pub fn screenshot_reveal(app: AppHandle, id: String) -> Result<(), String> {
    let path = safe_item_path(&app, &id)?;
    if !path.is_file() { return Err("Screenshot not found".into()); }
    #[cfg(windows)]
    {
        use tauri_plugin_opener::OpenerExt;
        let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
        app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Reveal is only supported on Windows".into())
    }
}

/// Alt+F4 只隐藏截图层并释放临时图片，主窗口保持原有状态。
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if window.label() != "screenshot-overlay"
        || !matches!(event, WindowEvent::CloseRequested { .. })
    {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    }
    drafts().lock().ok().and_then(|mut state| {
        let id = state.keys().next()?.clone();
        state.remove(&id)
    });
}
