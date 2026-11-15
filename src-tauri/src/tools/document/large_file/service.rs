//! 会话生命周期、可取消前台任务及后台索引；状态轮询不等待大文件 I/O 锁。
use super::buffer::unique;
use super::document::{Block, Document, Info};
use super::index::{self, Index};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

static SESSIONS: OnceLock<Mutex<HashMap<String, Arc<Session>>>> = OnceLock::new();
fn sessions() -> &'static Mutex<HashMap<String, Arc<Session>>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}
pub struct Session {
    pub document: Mutex<Document>,
    pub index: Mutex<Index>,
    pub revision: AtomicU64,
    pub closed: AtomicBool,
    pub dirty: AtomicBool,
    pub pending: AtomicBool,
    busy: AtomicBool,
    cancel: AtomicBool,
    done: AtomicU64,
    total: AtomicU64,
    kind: Mutex<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub id: String,
    pub info: Info,
    pub block: Block,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub busy: bool,
    pub kind: String,
    pub done: u64,
    pub total: u64,
    pub indexed: u64,
    pub index_total: u64,
    pub index_complete: bool,
    pub lines: u64,
    pub index_error: Option<String>,
}
struct Working<'a>(&'a Session);
impl Drop for Working<'_> {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::Release);
    }
}
impl Session {
    pub fn run<T>(
        &self,
        kind: &str,
        body: impl FnOnce(&mut Document, &Self) -> Result<T, String>,
    ) -> Result<T, String> {
        if self
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err("Another file operation is still running".into());
        }
        let _working = Working(self);
        self.cancel.store(false, Ordering::Release);
        self.done.store(0, Ordering::Release);
        *self.kind.lock().map_err(|_| "Task state is unavailable")? = kind.into();
        if self.closed.load(Ordering::Acquire) {
            return Err("The editing session is closed".into());
        }
        let mut doc = self
            .document
            .lock()
            .map_err(|_| "Document state is unavailable")?;
        self.total.store(doc.buffer.view.len, Ordering::Release);
        let result = body(&mut doc, self);
        self.revision.store(doc.revision, Ordering::Release);
        self.dirty.store(doc.buffer.dirty(), Ordering::Release);
        result
    }
    pub fn check(&self, at: u64) -> Result<(), String> {
        self.done.store(at, Ordering::Release);
        if self.cancel.load(Ordering::Acquire) || self.closed.load(Ordering::Acquire) {
            Err("Operation cancelled. The original file was not overwritten".into())
        } else {
            Ok(())
        }
    }
    pub fn index_copy(&self) -> Result<Index, String> {
        self.index
            .lock()
            .map(|i| i.clone())
            .map_err(|_| "Line index is unavailable".into())
    }
    pub fn status(&self) -> Result<Status, String> {
        let index = self.index.lock().map_err(|_| "Line index is unavailable")?;
        Ok(Status {
            busy: self.busy.load(Ordering::Acquire),
            kind: self
                .kind
                .lock()
                .map_err(|_| "Task state is unavailable")?
                .clone(),
            done: self.done.load(Ordering::Acquire),
            total: self.total.load(Ordering::Acquire),
            indexed: index.scanned,
            index_total: index.total,
            index_complete: index.complete,
            lines: index.lines,
            index_error: index.error.clone(),
        })
    }
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Release);
    }
    pub fn reindex(self: &Arc<Self>) -> Result<(), String> {
        let doc = self
            .document
            .lock()
            .map_err(|_| "Document state is unavailable")?;
        let (revision, bom, encoding, view) =
            (doc.revision, doc.bom, doc.encoding, doc.buffer.view.clone());
        drop(doc);
        self.revision.store(revision, Ordering::Release);
        *self.index.lock().map_err(|_| "Line index is unavailable")? =
            Index::new(revision, bom, view.len);
        let session = self.clone();
        std::thread::spawn(move || {
            let result = (|| {
                let mut point = index::Point {
                    offset: bom,
                    line: 1,
                    line_start: bom,
                };
                while point.offset < view.len {
                    if session.closed.load(Ordering::Acquire)
                        || session.revision.load(Ordering::Acquire) != revision
                    {
                        return Ok(());
                    }
                    let bytes = index::raw_block(&view, encoding, point.offset)?;
                    point = index::advance(point, &bytes, encoding)?;
                    let mut current = session
                        .index
                        .lock()
                        .map_err(|_| "Line index is unavailable")?;
                    if current.revision != revision {
                        return Ok(());
                    }
                    current.points.push(point);
                    current.scanned = point.offset;
                    current.lines = point.line;
                }
                let mut current = session
                    .index
                    .lock()
                    .map_err(|_| "Line index is unavailable")?;
                if current.revision == revision {
                    current.complete = true;
                    current.scanned = view.len;
                }
                Ok::<(), String>(())
            })();
            if let Err(error) = result {
                if let Ok(mut current) = session.index.lock() {
                    if current.revision == revision {
                        current.error = Some(error);
                    }
                }
            }
        });
        Ok(())
    }
}
pub fn open(path: &Path, encoding: &str, scratch: &Path) -> Result<Opened, String> {
    let document = Document::open(path, encoding, scratch)?;
    let index = Index::new(0, document.bom, document.buffer.view.len);
    let block = document.block(document.bom, &index, &|_| Ok(()))?;
    let info = document.info();
    let id = unique();
    let session = Arc::new(Session {
        document: Mutex::new(document),
        index: Mutex::new(index),
        revision: AtomicU64::new(0),
        closed: AtomicBool::new(false),
        dirty: AtomicBool::new(false),
        pending: AtomicBool::new(false),
        busy: AtomicBool::new(false),
        cancel: AtomicBool::new(false),
        done: AtomicU64::new(0),
        total: AtomicU64::new(info.size),
        kind: Mutex::new(String::new()),
    });
    let mut all = sessions()
        .lock()
        .map_err(|_| "Editing sessions are unavailable")?;
    // 前端最多八个标签，额外一个会话用于编码重读成功后替换旧会话。
    if all.len() >= 9 {
        return Err("Close another large-text editing session first".into());
    }
    all.insert(id.clone(), session.clone());
    drop(all);
    session.reindex()?;
    Ok(Opened { id, info, block })
}
pub fn get(id: &str) -> Result<Arc<Session>, String> {
    sessions()
        .lock()
        .map_err(|_| "Editing sessions are unavailable")?
        .get(id)
        .cloned()
        .ok_or_else(|| "The file session has expired. Open the file again".into())
}
pub fn close(id: &str, discard: bool) -> Result<(), String> {
    let session = get(id)?;
    if session
        .busy
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("Cancel the running operation before closing the file".into());
    }
    let _working = Working(&session);
    if !discard
        && (session.dirty.load(Ordering::Acquire) || session.pending.load(Ordering::Acquire))
    {
        return Err("The file has unsaved changes".into());
    }
    session.closed.store(true, Ordering::Release);
    session.cancel();
    if let Ok(doc) = session.document.lock() {
        doc.buffer.view.added.cleanup();
    }
    sessions()
        .lock()
        .map_err(|_| "Editing sessions are unavailable")?
        .remove(id);
    Ok(())
}
pub fn has_unsaved() -> bool {
    sessions()
        .lock()
        .map(|s| {
            s.values().any(|s| {
                s.dirty.load(Ordering::Acquire)
                    || s.pending.load(Ordering::Acquire)
                    || s.busy.load(Ordering::Acquire)
            })
        })
        .unwrap_or(true)
}
pub fn shutdown() {
    if let Ok(mut all) = sessions().lock() {
        for session in all.values() {
            session.closed.store(true, Ordering::Release);
            session.cancel();
            if let Ok(doc) = session.document.try_lock() {
                doc.buffer.view.added.cleanup();
            }
        }
        all.clear();
    }
}

pub fn has_sessions() -> bool {
    sessions().lock().map(|s| !s.is_empty()).unwrap_or(true)
}
