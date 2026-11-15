//! 一个编辑会话拥有原始文件句柄、当前路径保护句柄和磁盘编辑缓冲区。
use super::buffer::{open_source, Buffer};
use super::encoding::Encoding;
#[cfg(test)]
use super::index::Point;
use super::index::{self, Index};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Stamp {
    len: u64,
    modified: Option<SystemTime>,
    identity: (u64, u64),
}
impl Stamp {
    pub fn of(file: &File) -> Result<Self, String> {
        let meta = file.metadata().map_err(|e| e.to_string())?;
        #[cfg(unix)]
        let identity = {
            use std::os::unix::fs::MetadataExt;
            (meta.dev(), meta.ino())
        };
        #[cfg(windows)]
        let identity = {
            use std::os::windows::io::AsRawHandle;
            use windows_sys::Win32::Storage::FileSystem::{
                GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
            };
            let mut info = unsafe { std::mem::zeroed::<BY_HANDLE_FILE_INFORMATION>() };
            if unsafe { GetFileInformationByHandle(file.as_raw_handle() as _, &mut info) } == 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
            (
                info.dwVolumeSerialNumber as u64,
                ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64,
            )
        };
        #[cfg(not(any(unix, windows)))]
        let identity = (0, 0);
        Ok(Self {
            len: meta.len(),
            modified: meta.modified().ok(),
            identity,
        })
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub path: String,
    pub size: u64,
    pub encoding: Encoding,
    pub newline: String,
    pub revision: u64,
    pub dirty: bool,
    pub can_undo: bool,
    pub can_redo: bool,
    pub readonly: bool,
    pub bom: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub start: u64,
    pub end: u64,
    pub first_line: u64,
    pub continuation: bool,
    pub text: String,
    pub revision: u64,
}
pub struct Document {
    pub path: PathBuf,
    pub buffer: Buffer,
    pub encoding: Encoding,
    pub bom: u64,
    pub newline: String,
    pub revision: u64,
    pub guard: File,
    pub stamp: Stamp,
    pub source_stamp: Stamp,
    pub source_guard: File,
    pub backup: Option<PathBuf>,
    pub valid: bool,
}
impl Document {
    pub fn open(path: &Path, encoding: &str, scratch: &Path) -> Result<Self, String> {
        let path = path
            .canonicalize()
            .map_err(|e| format!("Can't locate the file: {e}"))?;
        let mut guard = open_source(&path)?;
        let meta = guard.metadata().map_err(|e| e.to_string())?;
        if !meta.is_file() {
            return Err("Select a regular text file".into());
        }
        // JS 的整数偏移限制；避免在 IPC 中丢失文件位置精度。
        if meta.len() > 9_007_199_254_740_991 {
            return Err("The file is too large for precise editor offsets".into());
        }
        let mut sample = vec![0; meta.len().min(64 * 1024) as usize];
        guard.read_exact(&mut sample).map_err(|e| e.to_string())?;
        let (encoding, bom) = Encoding::detect(&sample, encoding)?;
        let body = &sample[bom as usize..];
        let count = encoding.complete_prefix(body, meta.len() > sample.len() as u64)?;
        let decoded = encoding.decode(&body[..count])?;
        if decoded.contains('\0') {
            return Err(
                "This file contains NUL characters. Verify the text encoding before editing".into(),
            );
        }
        let crlf = decoded.matches("\r\n").count();
        let lf = decoded.matches('\n').count();
        let cr = decoded.matches('\r').count();
        let newline = if crlf > 0 && crlf * 2 >= lf {
            "\r\n"
        } else if cr > 0 && lf == 0 {
            "\r"
        } else {
            "\n"
        }
        .to_owned();
        let stamp = Stamp::of(&guard)?;
        let source_guard = guard.try_clone().map_err(|e| e.to_string())?;
        let buffer = Buffer::new(
            guard.try_clone().map_err(|e| e.to_string())?,
            meta.len(),
            scratch,
        )?;
        Ok(Self {
            path,
            buffer,
            encoding,
            bom,
            newline,
            revision: 0,
            guard,
            stamp: stamp.clone(),
            source_stamp: stamp,
            source_guard,
            backup: None,
            valid: true,
        })
    }
    pub fn unchanged(&self) -> Result<(), String> {
        if !self.valid {
            return Err("The file was saved but could not be reopened. Close this session and reopen the file".into());
        }
        let current = open_source(&self.path).map_err(|_| {
            "The original file is missing, busy or was replaced. Reopen it before saving".to_owned()
        })?;
        if Stamp::of(&current)? != self.stamp || Stamp::of(&self.source_guard)? != self.source_stamp
        {
            return Err("The file was changed by another program. Your edits are retained; close and reopen before overwriting anything".into());
        }
        Ok(())
    }
    pub fn check_revision(&self, revision: u64) -> Result<(), String> {
        if revision != self.revision {
            Err("This edit belongs to an older document revision. Reload the text block".into())
        } else {
            self.unchanged()
        }
    }
    pub fn info(&self) -> Info {
        Info {
            path: self.path.to_string_lossy().into_owned(),
            size: self.buffer.view.len,
            encoding: self.encoding,
            newline: match self.newline.as_str() {
                "\r\n" => "CRLF",
                "\r" => "CR",
                _ => "LF",
            }
            .into(),
            revision: self.revision,
            dirty: self.buffer.dirty(),
            can_undo: self.buffer.can_undo(),
            can_redo: self.buffer.can_redo(),
            readonly: self
                .guard
                .metadata()
                .map(|m| m.permissions().readonly())
                .unwrap_or(true),
            bom: self.bom,
        }
    }
    pub fn block(
        &self,
        at: u64,
        index: &Index,
        check: &dyn Fn(u64) -> Result<(), String>,
    ) -> Result<Block, String> {
        self.block_to(at, self.buffer.view.len, index, check)
    }
    /// 可限制末端，供连续滚动读取严格相接、互不重叠的窗口。
    pub fn block_to(
        &self,
        at: u64,
        end: u64,
        index: &Index,
        check: &dyn Fn(u64) -> Result<(), String>,
    ) -> Result<Block, String> {
        self.unchanged()?;
        if end < self.bom || end > self.buffer.view.len || at > end {
            return Err("Invalid text window range".into());
        }
        let at = at.max(self.bom).min(self.buffer.view.len);
        let point = index::locate(
            &self.buffer.view,
            self.encoding,
            index.seed_offset(at),
            at,
            check,
        )?;
        if point.offset > end {
            return Err("Text window ends inside a character".into());
        }
        let mut bytes = index::raw_block(&self.buffer.view, self.encoding, point.offset)?;
        bytes.truncate((end - point.offset).min(bytes.len() as u64) as usize);
        Ok(Block {
            start: point.offset,
            end: point.offset + bytes.len() as u64,
            first_line: point.line,
            continuation: point.offset > point.line_start,
            text: self.encoding.normalized(&bytes)?.text,
            revision: self.revision,
        })
    }
    #[cfg(test)]
    pub fn edit(
        &mut self,
        revision: u64,
        start: u64,
        end: u64,
        text: &str,
    ) -> Result<bool, String> {
        self.check_revision(revision)?;
        if self.info().readonly {
            return Err("The file is read-only".into());
        }
        if start < self.bom
            || start > end
            || end > self.buffer.view.len
            || end - start > 4 * 1024 * 1024
            || text.len() > 4 * 1024 * 1024
        {
            return Err("The edit is larger than the bounded text block".into());
        }
        let old = self
            .encoding
            .normalized(&self.buffer.view.read(start, (end - start) as usize)?)?;
        let text = text.replace("\r\n", "\n").replace('\r', "\n");
        if old.text == text {
            return Ok(false);
        }
        let a: Vec<char> = old.text.chars().collect();
        let b: Vec<char> = text.chars().collect();
        let mut prefix = 0;
        while prefix < a.len().min(b.len()) && a[prefix] == b[prefix] {
            prefix += 1;
        }
        let mut suffix = 0;
        while suffix < a.len() - prefix
            && suffix < b.len() - prefix
            && a[a.len() - 1 - suffix] == b[b.len() - 1 - suffix]
        {
            suffix += 1;
        }
        let added: String = b[prefix..b.len() - suffix].iter().collect();
        let from = a[..prefix].iter().map(|c| c.len_utf16()).sum();
        let to = a[..a.len() - suffix].iter().map(|c| c.len_utf16()).sum();
        self.edit_changes(
            revision,
            start,
            end,
            &text,
            &[Edit {
                from,
                to,
                text: added,
            }],
        )
    }
    /// 前端提交原块坐标下互不重叠的修改；按倒序应用，保留修改之间的原始字节。
    pub fn edit_changes(
        &mut self,
        revision: u64,
        start: u64,
        end: u64,
        text: &str,
        changes: &[Edit],
    ) -> Result<bool, String> {
        self.check_revision(revision)?;
        if self.info().readonly {
            return Err("The file is read-only".into());
        }
        if start < self.bom
            || start > end
            || end > self.buffer.view.len
            || end - start > 4 * 1024 * 1024
            || text.len() > 4 * 1024 * 1024
            || changes.len() > 4096
        {
            return Err("The edit is larger than the bounded text block".into());
        }
        let old = self
            .encoding
            .normalized(&self.buffer.view.read(start, (end - start) as usize)?)?;
        if old.text == text {
            return Ok(false);
        }
        let mut units = vec![0usize];
        for ch in old.text.chars() {
            units.push(units.last().copied().unwrap() + ch.len_utf16());
        }
        let utf8: Vec<usize> = old
            .text
            .char_indices()
            .map(|(at, _)| at)
            .chain(Some(old.text.len()))
            .collect();
        let mut expected = String::new();
        let mut previous = 0;
        let mut edits = Vec::new();
        let mut inserted = 0usize;
        for change in changes {
            if change.from > change.to || change.text.contains('\r') {
                return Err("Invalid normalized text edit".into());
            }
            inserted = inserted
                .checked_add(change.text.len())
                .ok_or("The edit is too large")?;
            if inserted > 4 * 1024 * 1024 {
                return Err("The edit is too large".into());
            }
            let from = units
                .binary_search(&change.from)
                .map_err(|_| "The edit splits a Unicode character")?;
            let to = units
                .binary_search(&change.to)
                .map_err(|_| "The edit splits a Unicode character")?;
            if from < previous {
                return Err("Text edits overlap or are out of order".into());
            }
            expected.push_str(&old.text[utf8[previous]..utf8[from]]);
            expected.push_str(&change.text);
            previous = to;
            let bytes = self
                .encoding
                .encode(&change.text.replace('\n', &self.newline))?;
            edits.push((
                start + old.positions[from] as u64,
                start + old.positions[to] as u64,
                bytes,
            ));
        }
        expected.push_str(&old.text[utf8[previous]..]);
        if expected != text {
            return Err("The submitted changes do not match the text block. Your original file was not changed".into());
        }
        edits.reverse();
        self.buffer.replace_many(&edits)?;
        self.revision += 1;
        Ok(true)
    }
    #[cfg(test)]
    pub fn point(&self) -> Point {
        Point {
            offset: self.bom,
            line: 1,
            line_start: self.bom,
        }
    }
}

#[derive(Deserialize)]
pub struct Edit {
    pub from: usize,
    pub to: usize,
    pub text: String,
}
