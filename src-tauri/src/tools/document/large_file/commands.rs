//! 仅主窗口可访问编辑会话；耗时 I/O 全部通过后台线程执行。
use super::document::{Block, Edit, Info};
use super::{index, save, service};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::{Manager, WebviewWindow};

fn authorize(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Large text editing is only available in the main window".into())
    }
}
async fn worker<T: Send + 'static>(
    body: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(body)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn large_text_open(
    window: WebviewWindow,
    path: String,
    encoding: String,
) -> Result<service::Opened, String> {
    authorize(&window)?;
    let scratch = crate::core::paths::sub_dir(window.app_handle(), "large-text")?;
    worker(move || service::open(&PathBuf::from(path), &encoding, &scratch)).await
}
#[tauri::command]
pub async fn large_text_read(
    window: WebviewWindow,
    id: String,
    revision: u64,
    start: u64,
    end: Option<u64>,
) -> Result<Block, String> {
    authorize(&window)?;
    worker(move || {
        let s = service::get(&id)?;
        s.run("read", |d, s| {
            d.check_revision(revision)?;
            d.block_to(
                start,
                end.unwrap_or(d.buffer.view.len),
                &s.index_copy()?,
                &|at| s.check(at),
            )
        })
    })
    .await
}
#[tauri::command]
pub async fn large_text_edit(
    window: WebviewWindow,
    id: String,
    revision: u64,
    start: u64,
    end: u64,
    text: String,
    changes: Vec<Edit>,
) -> Result<Info, String> {
    authorize(&window)?;
    worker(move || {
        let s = service::get(&id)?;
        let result = s.run("edit", |d, _| {
            d.edit_changes(revision, start, end, &text, &changes)?;
            Ok(d.info())
        })?;
        s.pending.store(false, Ordering::Release);
        if result.revision != revision {
            s.reindex()?;
        }
        Ok(result)
    })
    .await
}
#[tauri::command]
pub async fn large_text_history(
    window: WebviewWindow,
    id: String,
    revision: u64,
    redo: bool,
) -> Result<Info, String> {
    authorize(&window)?;
    worker(move || {
        let s = service::get(&id)?;
        let info = s.run("history", |d, _| {
            d.check_revision(revision)?;
            let changed = if redo {
                d.buffer.redo()
            } else {
                d.buffer.undo()
            };
            if changed {
                d.revision += 1;
            }
            Ok(d.info())
        })?;
        if info.revision != revision {
            s.reindex()?;
        }
        Ok(info)
    })
    .await
}
#[tauri::command]
pub async fn large_text_jump(
    window: WebviewWindow,
    id: String,
    revision: u64,
    line: u64,
) -> Result<Block, String> {
    authorize(&window)?;
    worker(move || {
        let s = service::get(&id)?;
        s.run("jump", |d, s| {
            d.check_revision(revision)?;
            let i = s.index_copy()?;
            let at =
                index::line_offset(&d.buffer.view, d.encoding, i.seed_line(line), line, &|at| {
                    s.check(at)
                })?;
            d.block(at, &i, &|at| s.check(at))
        })
    })
    .await
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    found: Option<index::Found>,
    block: Option<Block>,
}
#[tauri::command]
pub async fn large_text_search(
    window: WebviewWindow,
    id: String,
    revision: u64,
    start: u64,
    query: String,
) -> Result<SearchResult, String> {
    authorize(&window)?;
    worker(move || {
        let s = service::get(&id)?;
        s.run("search", |d, s| {
            d.check_revision(revision)?;
            let i = s.index_copy()?;
            let at = index::locate(
                &d.buffer.view,
                d.encoding,
                i.seed_offset(start.max(d.bom)),
                start.max(d.bom).min(d.buffer.view.len),
                &|at| s.check(at),
            )?
            .offset;
            let found = index::search(&d.buffer.view, d.encoding, at, &query, &|at| s.check(at))?;
            let block = found
                .as_ref()
                .map(|f| d.block(f.start, &i, &|at| s.check(at)))
                .transpose()?;
            Ok(SearchResult { found, block })
        })
    })
    .await
}
#[derive(Serialize)]
pub struct Saved {
    info: Info,
    // 保持 IPC 返回字段兼容；保存不再创建备份，此字段始终为空。
    backup: String,
}
#[tauri::command]
pub async fn large_text_save(
    window: WebviewWindow,
    id: String,
    revision: u64,
) -> Result<Saved, String> {
    authorize(&window)?;
    worker(move || {
        let s = service::get(&id)?;
        s.run("save", |d, s| {
            d.check_revision(revision)?;
            save::save(d, &|at| s.check(at))?;
            Ok(Saved {
                info: d.info(),
                backup: String::new(),
            })
        })
    })
    .await
}
#[tauri::command]
pub fn large_text_status(window: WebviewWindow, id: String) -> Result<service::Status, String> {
    authorize(&window)?;
    service::get(&id)?.status()
}
#[tauri::command]
pub fn large_text_pending(window: WebviewWindow, id: String, pending: bool) -> Result<(), String> {
    authorize(&window)?;
    service::get(&id)?.pending.store(pending, Ordering::Release);
    Ok(())
}
#[tauri::command]
pub fn large_text_cancel(window: WebviewWindow, id: String) -> Result<(), String> {
    authorize(&window)?;
    service::get(&id)?.cancel();
    Ok(())
}
#[tauri::command]
pub fn large_text_close(window: WebviewWindow, id: String, discard: bool) -> Result<(), String> {
    authorize(&window)?;
    service::close(&id, discard)
}
#[tauri::command]
pub fn large_text_exit(window: WebviewWindow, code: Option<i32>) -> Result<(), String> {
    authorize(&window)?;
    if service::has_unsaved() {
        return Err("Save or close the file before exiting".into());
    }
    if code == Some(tauri::RESTART_EXIT_CODE) {
        window.app_handle().restart();
    }
    window.app_handle().exit(code.unwrap_or(0));
    Ok(())
}
