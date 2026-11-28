//! 笔记本统一持久化存取层，保证界面命令与 AI 工具共享同一把互斥锁。

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter};

use super::files::{self, Book, Text};

pub(crate) const NOTEBOOK_CHANGED_EVENT: &str = "notebook-changed";

static NOTEBOOK_IO: Mutex<()> = Mutex::new(());

fn notebook_dir(app: &AppHandle) -> Result<PathBuf, String> {
    crate::core::paths::sub_dir(app, "notebook")
}

pub(super) fn read_snapshot(app: &AppHandle) -> Result<Option<String>, String> {
    let dir = notebook_dir(app)?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    files::read(&dir).map_err(|e| format!("Failed to read the notebook: {e}"))
}

pub(super) fn write_snapshot(app: &AppHandle, data: &str) -> Result<(), String> {
    let dir = notebook_dir(app)?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    files::write(&dir, data).map_err(|e| format!("Failed to save the notebook: {e}"))
}

pub(super) fn read_book(app: &AppHandle) -> Result<Book<Text>, String> {
    let dir = notebook_dir(app)?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    let book = files::read_book(&dir).map_err(|e| format!("Failed to read the notebook: {e}"))?;
    Ok(book.unwrap_or_else(Book::empty))
}

/// 在单次互斥锁内完成读取、修改与持久化，并在成功后通知前端刷新笔记本状态。
pub(super) fn mutate_book<R>(
    app: &AppHandle,
    mutate: impl FnOnce(&mut Book<Text>) -> Result<R, String>,
) -> Result<R, String> {
    let dir = notebook_dir(app)?;
    let result = {
        let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
        let mut book = files::read_book(&dir)
            .map_err(|e| format!("Failed to read the notebook: {e}"))?
            .unwrap_or_else(Book::empty);
        let output = mutate(&mut book)?;
        files::write_book(&dir, book).map_err(|e| format!("Failed to save the notebook: {e}"))?;
        output
    };
    let _ = app.emit(NOTEBOOK_CHANGED_EVENT, ());
    Ok(result)
}

pub(super) fn save_image(app: &AppHandle, id: &str, data: &[u8]) -> Result<String, String> {
    let dir = notebook_dir(app)?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    files::save_image(&dir, id, data).map_err(|e| format!("Failed to save notebook image: {e}"))
}

pub(super) fn read_image(app: &AppHandle, id: &str, name: &str) -> Result<Vec<u8>, String> {
    let dir = notebook_dir(app)?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    files::read_image(&dir, id, name).map_err(|e| format!("Failed to read notebook image: {e}"))
}

#[cfg(windows)]
pub(super) fn entry_path(app: &AppHandle, id: &str) -> Result<(PathBuf, bool), String> {
    let dir = notebook_dir(app)?;
    let _guard = NOTEBOOK_IO.lock().map_err(|e| e.to_string())?;
    files::entry_path(&dir, id).map_err(|e| e.to_string())
}
