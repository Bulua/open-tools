//! 历史截图的安全路径、时间命名、读取、删除与文件定位。
use super::types::ScreenshotItem;
use crate::core::paths;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Runtime};
pub(super) const MAX_PNG_SIZE: usize = 100 * 1024 * 1024;

pub(super) fn screenshots_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    paths::sub_dir(app, "screenshots")
}

#[cfg(windows)]
pub(super) fn local_stamp() -> (String, String, String) {
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

pub(super) fn safe_item_path<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<PathBuf, String> {
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
pub(super) fn png_dimensions(path: &Path) -> Option<(u32, u32)> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    Some((
        u32::from_be_bytes(bytes[16..20].try_into().ok()?),
        u32::from_be_bytes(bytes[20..24].try_into().ok()?),
    ))
}

pub(super) fn item_from_path(day: &str, hour: &str, path: &Path) -> Option<ScreenshotItem> {
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

pub(super) fn screenshot_list(app: AppHandle) -> Result<Vec<ScreenshotItem>, String> {
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

pub(super) fn screenshot_read(app: AppHandle, id: String) -> Result<String, String> {
    let bytes = std::fs::read(safe_item_path(&app, &id)?).map_err(|e| e.to_string())?;
    Ok(BASE64.encode(bytes))
}

pub(super) fn screenshot_delete(app: AppHandle, id: String) -> Result<(), String> {
    std::fs::remove_file(safe_item_path(&app, &id)?).map_err(|e| e.to_string())
}

pub(super) fn screenshot_reveal(app: AppHandle, id: String) -> Result<(), String> {
    let path = safe_item_path(&app, &id)?;
    if !path.is_file() {
        return Err("Screenshot not found".into());
    }
    #[cfg(windows)]
    {
        use tauri_plugin_opener::OpenerExt;
        let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
        app.opener()
            .reveal_item_in_dir(path)
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Reveal is only supported on Windows".into())
    }
}
