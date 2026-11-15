//! 文件支持的 Piece Table：原文件和新增内容都留在磁盘，只在内存保留片段及有界历史。
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

pub const BLOCK: usize = 256 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(1);
pub fn unique() -> String {
    format!(
        "{}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
pub fn open_source(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    // 禁止其他进程写入，但允许安全替换时重命名文件；旧句柄仍可读取原始片段。
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1 | 4);
    }
    options
        .open(path)
        .map_err(|e| format!("Can't open the file (it may be busy): {e}"))
}
pub struct Disk {
    file: Mutex<File>,
    remove: Option<PathBuf>,
}
impl Disk {
    pub fn source(file: File) -> Arc<Self> {
        Arc::new(Self {
            file: Mutex::new(file),
            remove: None,
        })
    }
    pub fn scratch(directory: &Path) -> Result<Arc<Self>, String> {
        std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
        let path = directory.join(format!("{}.edits", unique()));
        let mut options = OpenOptions::new();
        options.read(true).write(true).create_new(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(1 | 2 | 4);
        }
        let file = options.open(&path).map_err(|e| e.to_string())?;
        Ok(Arc::new(Self {
            file: Mutex::new(file),
            remove: Some(path),
        }))
    }
    fn read(&self, offset: u64, out: &mut [u8]) -> Result<(), String> {
        let mut file = self.file.lock().map_err(|_| "File state is unavailable")?;
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| e.to_string())?;
        file.read_exact(out)
            .map_err(|e| format!("Can't read file contents: {e}"))
    }
    pub fn cleanup(&self) {
        if let Some(path) = &self.remove {
            let _ = std::fs::remove_file(path);
        }
    }
    fn append(&self, bytes: &[u8]) -> Result<u64, String> {
        let mut file = self.file.lock().map_err(|_| "Edit buffer is unavailable")?;
        let at = file.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
        file.write_all(bytes)
            .map_err(|e| format!("Can't stage the edit: {e}"))?;
        Ok(at)
    }
}
impl Drop for Disk {
    fn drop(&mut self) {
        if let Some(path) = &self.remove {
            let _ = std::fs::remove_file(path);
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Piece {
    pub added: bool,
    pub offset: u64,
    pub len: u64,
}
#[derive(Clone)]
pub struct Snapshot {
    pub pieces: Vec<Piece>,
    pub source: Arc<Disk>,
    pub added: Arc<Disk>,
    pub len: u64,
}
impl Snapshot {
    pub fn read(&self, start: u64, length: usize) -> Result<Vec<u8>, String> {
        if start > self.len {
            return Err("Text position is outside the document".into());
        }
        let count = (self.len - start).min(length as u64) as usize;
        let mut result = vec![0; count];
        let mut logical = 0;
        let mut written = 0;
        for piece in &self.pieces {
            let end = logical + piece.len;
            if start + written as u64 >= end {
                logical = end;
                continue;
            }
            let local = (start + written as u64).saturating_sub(logical);
            let n = (piece.len - local).min((count - written) as u64) as usize;
            let disk = if piece.added {
                &self.added
            } else {
                &self.source
            };
            disk.read(piece.offset + local, &mut result[written..written + n])?;
            written += n;
            logical = end;
            if written == count {
                break;
            }
        }
        if written != count {
            return Err("Invalid text piece table".into());
        }
        Ok(result)
    }
}
pub struct Buffer {
    pub view: Snapshot,
    undo: Vec<Vec<Piece>>,
    redo: Vec<Vec<Piece>>,
    saved: Vec<Piece>,
}
impl Buffer {
    pub fn new(file: File, length: u64, scratch: &Path) -> Result<Self, String> {
        let pieces = if length == 0 {
            vec![]
        } else {
            vec![Piece {
                added: false,
                offset: 0,
                len: length,
            }]
        };
        Ok(Self {
            saved: pieces.clone(),
            view: Snapshot {
                pieces,
                source: Disk::source(file),
                added: Disk::scratch(scratch)?,
                len: length,
            },
            undo: vec![],
            redo: vec![],
        })
    }
    fn parts(&self, from: u64, to: u64) -> Vec<Piece> {
        let mut at = 0;
        let mut out = Vec::new();
        for p in &self.view.pieces {
            let left = from.max(at);
            let right = to.min(at + p.len);
            if left < right {
                out.push(Piece {
                    added: p.added,
                    offset: p.offset + left - at,
                    len: right - left,
                });
            }
            at += p.len;
        }
        out
    }
    pub fn replace(&mut self, from: u64, to: u64, bytes: &[u8]) -> Result<(), String> {
        self.replace_many(&[(from, to, bytes.to_vec())])
    }
    /// 一次用户提交只产生一个撤销节点；任意片段写入失败时回滚内存状态。
    pub fn replace_many(&mut self, changes: &[(u64, u64, Vec<u8>)]) -> Result<(), String> {
        if changes.is_empty() {
            return Ok(());
        }
        let original = self.view.pieces.clone();
        for (from, to, bytes) in changes {
            if let Err(error) = self.replace_inner(*from, *to, bytes) {
                self.set(original);
                return Err(error);
            }
        }
        self.undo.push(original);
        if self.undo.len() > 100 {
            self.undo.remove(0);
        }
        self.redo.clear();
        Ok(())
    }
    fn replace_inner(&mut self, from: u64, to: u64, bytes: &[u8]) -> Result<(), String> {
        if from > to || to > self.view.len {
            return Err("Invalid edit range".into());
        }
        if self.view.pieces.len() > 50_000 {
            return Err("Too many edits. Save and reopen the document".into());
        }
        let offset = self.view.added.append(bytes)?;
        let mut next = self.parts(0, from);
        if !bytes.is_empty() {
            next.push(Piece {
                added: true,
                offset,
                len: bytes.len() as u64,
            });
        }
        next.extend(self.parts(to, self.view.len));
        let mut compact: Vec<Piece> = Vec::new();
        for p in next {
            if let Some(last) = compact.last_mut() {
                if last.added == p.added && last.offset + last.len == p.offset {
                    last.len += p.len;
                    continue;
                }
            }
            compact.push(p);
        }
        self.set(compact);
        Ok(())
    }
    fn set(&mut self, pieces: Vec<Piece>) {
        self.view.len = pieces.iter().map(|p| p.len).sum();
        self.view.pieces = pieces;
    }
    pub fn undo(&mut self) -> bool {
        if let Some(p) = self.undo.pop() {
            self.redo.push(self.view.pieces.clone());
            self.set(p);
            true
        } else {
            false
        }
    }
    pub fn redo(&mut self) -> bool {
        if let Some(p) = self.redo.pop() {
            self.undo.push(self.view.pieces.clone());
            self.set(p);
            true
        } else {
            false
        }
    }
    pub fn dirty(&self) -> bool {
        self.view.pieces != self.saved
    }
    pub fn mark_saved(&mut self) {
        self.saved = self.view.pieces.clone();
    }
    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }
    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }
}
