//! Windows 剪贴板历史。监听与磁盘写入独立于 WebView 的生命周期。

mod native;
mod store;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use self::store::{now, History, Store};

const POPUP: &str = "clipboard-history";
const CHANGED: &str = "clipboard-history-changed";
static OPEN_LOCK: Mutex<()> = Mutex::new(());

struct Session {
    store: Store,
    capture: CaptureGate,
    listener_error: Option<String>,
    save_error: Option<String>,
}

#[derive(Default)]
struct CaptureGate {
    generation: u64,
    ignore_through: Option<u64>,
    deleted_through: HashMap<[u8; 32], u64>,
}

impl CaptureGate {
    fn reset(&mut self, tick: u64) {
        self.generation += 1;
        self.ignore_through = Some(tick);
        self.deleted_through.clear();
    }

    fn accept(&mut self, generation: u64, notified_at: u64, text: &str) -> bool {
        // 监听线程按通知顺序处理，已经越过的删除标记可以释放。
        self.deleted_through.retain(|_, tick| *tick >= notified_at);
        self.generation == generation
            && (self.deleted_through.is_empty()
                || !self.deleted_through.contains_key(&text_digest(text)))
    }

    fn deleted(&mut self, text: &str, tick: u64) {
        self.deleted_through.insert(text_digest(text), tick);
    }
}

fn text_digest(text: &str) -> [u8; 32] {
    Sha256::digest(text.as_bytes()).into()
}

impl Session {
    fn save_background(&mut self, history: History) -> bool {
        let result = self.store.save(history);
        let changed = result.is_ok() || self.save_error.as_ref() != result.as_ref().err();
        self.save_error = result.err();
        changed
    }
}

pub(crate) struct Clipboard(Result<Mutex<Session>, String>);

impl Clipboard {
    fn session(&self) -> Result<std::sync::MutexGuard<'_, Session>, String> {
        self.0
            .as_ref()
            .map_err(Clone::clone)?
            .lock()
            .map_err(|_| "Can't access clipboard history".into())
    }
}

fn notify<R: Runtime>(app: &AppHandle<R>) {
    for label in ["main", POPUP] {
        let _ = app.emit_to(label, CHANGED, ());
    }
}

pub(crate) fn start<R: Runtime>(app: &AppHandle<R>) {
    let store = crate::core::paths::sub_dir(app, "clipboard")
        .and_then(|path| Store::load(path.join("history.dat")));
    let ready = store.is_ok();
    app.manage(Clipboard(store.map(|store| {
        Mutex::new(Session {
            store,
            capture: CaptureGate::default(),
            listener_error: None,
            save_error: None,
        })
    })));
    if !ready {
        return;
    }

    let listener_app = app.clone();
    let thread = std::thread::Builder::new()
        .name("clipboard-history".into())
        .spawn(move || {
            let result = native::listen(
                |hwnd, notified_at| {
                    let state = listener_app.state::<Clipboard>();
                    let generation = state.session().ok().and_then(|session| {
                        (session.store.history.enabled
                            && session
                                .capture
                                .ignore_through
                                .is_none_or(|tick| notified_at > tick))
                        .then_some(session.capture.generation)
                    });
                    let Some(generation) = generation else { return };
                    let Some(text) = native::read_text(hwnd) else {
                        return;
                    };
                    let Ok(mut session) = state.session() else {
                        return;
                    };
                    if !session.capture.accept(generation, notified_at, &text) {
                        return;
                    }
                    let mut history = session.store.history.clone();
                    history.record(text, now());
                    let changed = session.save_background(history);
                    drop(session);
                    if changed {
                        notify(&listener_app);
                    }
                },
                || {
                    let state = listener_app.state::<Clipboard>();
                    let Ok(mut session) = state.session() else {
                        return;
                    };
                    let time = now();
                    if session
                        .store
                        .history
                        .items
                        .iter()
                        .all(|item| item.active(time))
                    {
                        return;
                    }
                    let mut history = session.store.history.clone();
                    history.prune(time);
                    let changed = session.save_background(history);
                    drop(session);
                    if changed {
                        notify(&listener_app);
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

fn listener_failed<R: Runtime>(app: &AppHandle<R>, error: String) {
    let state = app.state::<Clipboard>();
    if let Ok(mut session) = state.session() {
        session.listener_error = Some(error);
    }
    notify(app);
}

fn authorize<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    match window.label() {
        "main" | POPUP => Ok(()),
        _ => Err("Clipboard history is unavailable in this window".into()),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Entry {
    id: u32,
    preview: String,
    copied_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    enabled: bool,
    max_items: usize,
    entries: Vec<Entry>,
    error: Option<String>,
}

#[tauri::command]
pub(crate) async fn clipboard_history_list(
    window: WebviewWindow,
    state: State<'_, Clipboard>,
    query: String,
) -> Result<Snapshot, String> {
    authorize(&window)?;
    let query = query.trim().to_lowercase();
    let (history, error) = {
        let session = state.session()?;
        (
            session.store.history.clone(),
            session
                .listener_error
                .as_ref()
                .or(session.save_error.as_ref())
                .cloned(),
        )
    };
    let time = now();
    let entries = history
        .items
        .iter()
        .filter(|item| {
            item.active(time) && (query.is_empty() || item.text.to_lowercase().contains(&query))
        })
        .map(|item| Entry {
            id: item.id,
            preview: store::preview(&item.text),
            copied_at: item.copied_at,
        })
        .collect();
    Ok(Snapshot {
        enabled: history.enabled,
        max_items: history.max_items,
        entries,
        error,
    })
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Update {
    Recording { enabled: bool },
    Limit { count: usize },
    Delete { id: u32 },
    Clear,
}

enum CaptureEffect {
    None,
    Reset,
    Delete(Arc<str>),
}

fn update<R: Runtime>(
    app: &AppHandle<R>,
    apply: impl FnOnce(&mut History) -> Result<CaptureEffect, String>,
) -> Result<(), String> {
    let state = app.state::<Clipboard>();
    let mut session = state.session()?;
    let mut history = session.store.history.clone();
    let effect = apply(&mut history)?;
    history.prune(now());
    session.store.save(history)?;
    session.save_error = None;
    match effect {
        CaptureEffect::None => {}
        CaptureEffect::Reset => session.capture.reset(native::current_tick()),
        CaptureEffect::Delete(text) => {
            session.capture.deleted(&text, native::current_tick());
        }
    }
    drop(session);
    notify(app);
    Ok(())
}

#[tauri::command]
pub(crate) async fn clipboard_history_update(
    window: WebviewWindow,
    action: Update,
) -> Result<(), String> {
    authorize(&window)?;
    update(window.app_handle(), |history| match action {
        Update::Recording { enabled } => {
            history.enabled = enabled;
            Ok(CaptureEffect::Reset)
        }
        Update::Limit { count } => {
            if !(1..=store::MAX_HISTORY_ITEMS).contains(&count) {
                return Err("Invalid clipboard history limit".into());
            }
            history.max_items = count;
            Ok(CaptureEffect::None)
        }
        Update::Delete { id } => {
            let Some(index) = history.items.iter().position(|item| item.id == id) else {
                return Ok(CaptureEffect::None);
            };
            Ok(CaptureEffect::Delete(history.items.remove(index).text))
        }
        Update::Clear => {
            history.items.clear();
            Ok(CaptureEffect::Reset)
        }
    })
}

pub(crate) fn toggle<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    update(app, |history| {
        history.enabled = !history.enabled;
        Ok(CaptureEffect::Reset)
    })
}

#[tauri::command]
pub(crate) async fn clipboard_history_copy(
    window: WebviewWindow,
    state: State<'_, Clipboard>,
    id: u32,
) -> Result<(), String> {
    authorize(&window)?;
    let text = state
        .session()?
        .store
        .history
        .items
        .iter()
        .find(|item| item.id == id && item.active(now()))
        .ok_or("This clipboard entry is no longer available")?
        .text
        .clone();
    native::write_private(window.hwnd().map_err(|e| e.to_string())?.0, &text)?;
    if window.label() == POPUP {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn clipboard_copy_private(
    window: WebviewWindow,
    text: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Private copy is unavailable in this window".into());
    }
    native::write_private(window.hwnd().map_err(|e| e.to_string())?.0, &text)
}

pub(crate) fn open<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let _guard = OPEN_LOCK
        .lock()
        .map_err(|_| "Can't open clipboard history")?;
    if let Some(window) = app.get_webview_window(POPUP) {
        return window.set_focus().map_err(|e| e.to_string());
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
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn clipboard_history_open(window: WebviewWindow) -> Result<(), String> {
    authorize(&window)?;
    open(window.app_handle())
}

#[cfg(test)]
mod tests {
    use super::CaptureGate;

    #[test]
    fn deleting_one_entry_only_filters_its_older_notifications() {
        let mut capture = CaptureGate::default();
        let generation = capture.generation;
        capture.deleted("已删除", 10);
        capture.deleted("也已删除", 12);

        assert!(capture.accept(generation, 9, "刚复制的其他文本"));
        assert!(!capture.accept(generation, 10, "已删除"));
        assert!(capture.accept(generation, 11, "已删除"));
        assert!(!capture.accept(generation, 12, "也已删除"));
        assert!(capture.accept(generation, 13, "也已删除"));
        assert!(capture.deleted_through.is_empty());
    }

    #[test]
    fn clearing_still_invalidates_an_in_flight_read() {
        let mut capture = CaptureGate::default();
        let generation = capture.generation;
        capture.reset(10);
        assert!(!capture.accept(generation, 9, "之前复制的内容"));
        assert!(capture.accept(capture.generation, 11, "清空后复制的内容"));
    }
}
