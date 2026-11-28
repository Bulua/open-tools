//! Windows 剪贴板历史运行态、后台监听与弹出窗口控制。

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::core::db::Database;
use crate::core::error::{AppError, AppResult};

use super::{native, store};

pub(super) const POPUP: &str = "clipboard-history";
const CHANGED: &str = "clipboard-history-changed";
static OPEN_LOCK: Mutex<()> = Mutex::new(());

#[derive(Default)]
struct CaptureGate {
    generation: u64,
    ignore_through: Option<u64>,
    deleted_through: HashMap<String, u64>,
}

impl CaptureGate {
    fn reset(&mut self, tick: u64) {
        self.generation += 1;
        self.ignore_through = Some(tick);
        self.deleted_through.clear();
    }

    fn accept(&mut self, generation: u64, notified_at: u64, content_hash: &str) -> bool {
        // 监听线程按通知顺序处理，已经越过的删除标记可以释放。
        self.deleted_through.retain(|_, tick| *tick >= notified_at);
        self.generation == generation
            && (self.deleted_through.is_empty()
                || !self.deleted_through.contains_key(content_hash))
    }

    fn deleted_hash(&mut self, content_hash: String, tick: u64) {
        self.deleted_through.insert(content_hash, tick);
    }
}

struct RuntimeState {
    enabled: bool,
    capture: CaptureGate,
    listener_error: Option<String>,
    save_error: Option<String>,
}

pub(crate) struct ClipboardRuntime(Mutex<RuntimeState>);

impl ClipboardRuntime {
    fn new(enabled: bool) -> Self {
        Self(Mutex::new(RuntimeState {
            enabled,
            capture: CaptureGate::default(),
            listener_error: None,
            save_error: None,
        }))
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, RuntimeState> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

pub(super) fn authorize<R: Runtime>(window: &WebviewWindow<R>) -> AppResult<()> {
    match window.label() {
        "main" | POPUP => Ok(()),
        _ => Err(AppError::unauthorized(
            "Clipboard history is unavailable in this window.",
        )),
    }
}

fn notify<R: Runtime>(app: &AppHandle<R>) {
    for label in ["main", POPUP] {
        let _ = app.emit_to(label, CHANGED, ());
    }
}

fn listener_failed<R: Runtime>(app: &AppHandle<R>, error: String) {
    let runtime = app.state::<ClipboardRuntime>();
    runtime.lock().listener_error = Some(error);
    notify(app);
}

/// 启动 Windows 剪贴板后台监听与定时过期清理。
pub(crate) fn start<R: Runtime>(app: &AppHandle<R>) {
    let db = app.state::<Database>();
    let initial_enabled = store::load_settings_sync(db.inner())
        .map(|s| s.enabled)
        .unwrap_or(true);
    let _ = store::prune_entries_sync(db.inner());
    app.manage(ClipboardRuntime::new(initial_enabled));

    let listener_app = app.clone();
    let thread = std::thread::Builder::new()
        .name("clipboard-history".into())
        .spawn(move || {
            let result = native::listen(
                |hwnd, notified_at| {
                    let runtime = listener_app.state::<ClipboardRuntime>();
                    let generation = {
                        let guard = runtime.lock();
                        (guard.enabled
                            && guard
                                .capture
                                .ignore_through
                                .is_none_or(|tick| notified_at > tick))
                        .then_some(guard.capture.generation)
                    };
                    let Some(generation) = generation else {
                        return;
                    };
                    let Some(text) = native::read_text(hwnd) else {
                        return;
                    };
                    let content_hash = store::content_hash_hex(&text);
                    {
                        let mut guard = runtime.lock();
                        if !guard.capture.accept(generation, notified_at, &content_hash) {
                            return;
                        }
                    }

                    let db = listener_app.state::<Database>();
                    let save_res = store::record_entry_sync(db.inner(), text);
                    let changed = {
                        let mut guard = runtime.lock();
                        let next_err = save_res.err().map(|e| e.message);
                        let notified = next_err.is_none() || guard.save_error != next_err;
                        guard.save_error = next_err;
                        notified
                    };
                    if changed {
                        notify(&listener_app);
                    }
                },
                || {
                    let db = listener_app.state::<Database>();
                    match store::prune_entries_sync(db.inner()) {
                        Ok(true) => notify(&listener_app),
                        Ok(false) => {}
                        Err(err) => {
                            let runtime = listener_app.state::<ClipboardRuntime>();
                            let mut guard = runtime.lock();
                            let msg = Some(err.message);
                            if guard.save_error != msg {
                                guard.save_error = msg;
                                drop(guard);
                                notify(&listener_app);
                            }
                        }
                    }
                },
            );
            if let Err(error) = result {
                listener_failed(&listener_app, error);
            }
        });

    if let Err(error) = thread {
        listener_failed(app, format!("Can't start clipboard listener: {error}"));
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Entry {
    pub(crate) id: String,
    pub(crate) preview: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    pub(crate) enabled: bool,
    pub(crate) max_items: usize,
    pub(crate) entries: Vec<Entry>,
    pub(crate) error: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Update {
    Recording { enabled: bool },
    Limit { count: usize },
    Delete { id: String },
    Clear,
}

pub(super) async fn list_snapshot(
    db: &Database,
    runtime: &ClipboardRuntime,
    query: String,
) -> AppResult<Snapshot> {
    let (settings, rows) = store::list_entries(db, query).await?;
    let error = {
        let guard = runtime.lock();
        guard
            .listener_error
            .as_ref()
            .or(guard.save_error.as_ref())
            .cloned()
    };
    let entries = rows
        .into_iter()
        .map(|row| Entry {
            id: row.id,
            preview: row.preview,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect();
    Ok(Snapshot {
        enabled: settings.enabled,
        max_items: settings.max_items,
        entries,
        error,
    })
}

pub(super) async fn apply_update<R: Runtime>(
    app: &AppHandle<R>,
    db: &Database,
    runtime: &ClipboardRuntime,
    action: Update,
) -> AppResult<()> {
    match action {
        Update::Recording { enabled } => {
            let db_clone = db.clone();
            tauri::async_runtime::spawn_blocking(move || {
                store::save_enabled_sync(&db_clone, enabled)
            })
            .await
            .map_err(|e| AppError::internal(format!("Clipboard settings task failed: {e}")))??;
            let mut guard = runtime.lock();
            guard.enabled = enabled;
            guard.save_error = None;
            guard.capture.reset(native::current_tick());
        }
        Update::Limit { count } => {
            store::save_max_items(db, count).await?;
            runtime.lock().save_error = None;
        }
        Update::Delete { id } => {
            let deleted_hash = store::delete_entry(db, id).await?;
            let mut guard = runtime.lock();
            guard.save_error = None;
            if let Some(hash) = deleted_hash {
                guard.capture.deleted_hash(hash, native::current_tick());
            }
        }
        Update::Clear => {
            store::clear_entries(db).await?;
            let mut guard = runtime.lock();
            guard.save_error = None;
            guard.capture.reset(native::current_tick());
        }
    }
    notify(app);
    Ok(())
}

pub(crate) fn toggle<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let db = app.state::<Database>();
    let runtime = app.state::<ClipboardRuntime>();
    let settings = store::load_settings_sync(db.inner())?;
    let next_enabled = !settings.enabled;
    store::save_enabled_sync(db.inner(), next_enabled)?;
    let mut guard = runtime.lock();
    guard.enabled = next_enabled;
    guard.save_error = None;
    guard.capture.reset(native::current_tick());
    drop(guard);
    notify(app);
    Ok(())
}

pub(super) async fn copy_entry(
    window: &WebviewWindow,
    db: &Database,
    id: String,
) -> AppResult<()> {
    authorize(window)?;
    let text = store::get_entry_content(db, id)
        .await?
        .ok_or_else(|| AppError::not_found("This clipboard entry is no longer available."))?;
    let hwnd = window
        .hwnd()
        .map_err(|e| AppError::internal(e.to_string()))?
        .0;
    native::write_private(hwnd, &text).map_err(AppError::internal)?;
    if window.label() == POPUP {
        window
            .close()
            .map_err(|e| AppError::internal(e.to_string()))?;
    }
    Ok(())
}

pub(super) fn copy_private(window: &WebviewWindow, text: &str) -> AppResult<()> {
    if window.label() != "main" {
        return Err(AppError::unauthorized(
            "Private copy is unavailable in this window.",
        ));
    }
    let hwnd = window
        .hwnd()
        .map_err(|e| AppError::internal(e.to_string()))?
        .0;
    native::write_private(hwnd, text).map_err(AppError::internal)
}

pub(crate) fn open<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let _guard = OPEN_LOCK
        .lock()
        .map_err(|_| AppError::internal("Can't open clipboard history."))?;
    if let Some(window) = app.get_webview_window(POPUP) {
        return window
            .set_focus()
            .map_err(|e| AppError::internal(e.to_string()));
    }
    WebviewWindowBuilder::new(
        app,
        POPUP,
        WebviewUrl::App("index.html?window=clipboard-history".into()),
    )
    .title("Open Tools")
    .inner_size(640.0, 530.0)
    .min_inner_size(420.0, 340.0)
    .center()
    .decorations(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .build()
    .map(|_| ())
    .map_err(|e| AppError::internal(e.to_string()))
}
