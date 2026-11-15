//! 完整流式写出后才替换原路径；保留最近一次备份并报告替换失败时的恢复位置。
use super::buffer::{open_source, unique, BLOCK};
use super::document::{Document, Stamp};
#[cfg(unix)]
use std::fs::File;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

struct Temporary {
    path: PathBuf,
    keep: bool,
}
impl Drop for Temporary {
    fn drop(&mut self) {
        if !self.keep {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}
#[cfg(windows)]
fn replace(path: &Path, temp: &Path, backup: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;
    let wide = |p: &Path| {
        p.as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<u16>>()
    };
    let (path, temp, backup) = (wide(path), wide(temp), wide(backup));
    if unsafe {
        ReplaceFileW(
            path.as_ptr(),
            temp.as_ptr(),
            backup.as_ptr(),
            0,
            std::ptr::null(),
            std::ptr::null(),
        )
    } == 0
    {
        Err(std::io::Error::last_os_error().to_string())
    } else {
        Ok(())
    }
}
#[cfg(not(windows))]
fn replace(path: &Path, temp: &Path, backup: &Path) -> Result<(), String> {
    std::fs::hard_link(path, backup).map_err(|e| format!("Can't create a recovery backup: {e}"))?;
    std::fs::rename(temp, path).map_err(|e| e.to_string())
}
pub fn save(
    doc: &mut Document,
    check: &dyn Fn(u64) -> Result<(), String>,
) -> Result<String, String> {
    doc.unchanged()?;
    if doc.info().readonly {
        return Err("The file is read-only".into());
    }
    let parent = doc
        .path
        .parent()
        .ok_or("Can't locate the original directory")?;
    let id = unique();
    let mut temporary = Temporary {
        path: parent.join(format!(".open-tools-{id}.tmp")),
        keep: false,
    };
    let backup = parent.join(format!(".open-tools-{id}.bak"));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary.path)
        .map_err(|e| format!("Can't create a temporary file beside the original: {e}"))?;
    // 同目录临时文件；绝不预先截断原文件。
    let mut at = 0;
    while at < doc.buffer.view.len {
        check(at)?;
        let bytes = doc.buffer.view.read(at, BLOCK)?;
        file.write_all(&bytes)
            .map_err(|e| format!("Can't save (check free disk space): {e}"))?;
        at += bytes.len() as u64;
    }
    check(at)?;
    file.set_permissions(
        doc.guard
            .metadata()
            .map_err(|e| e.to_string())?
            .permissions(),
    )
    .map_err(|e| e.to_string())?;
    file.sync_all()
        .map_err(|e| format!("Can't flush the saved file: {e}"))?;
    drop(file);
    doc.unchanged()?;
    check(at)?;
    if let Err(error) = replace(&doc.path, &temporary.path, &backup) {
        temporary.keep = true;
        return Err(format!("File replacement failed: {error}. Recovery files: {} and {}. Your editing session is retained",temporary.path.display(),backup.display()));
    }
    temporary.keep = true;
    // 保存已提交。此后不能将重新打开失败误报成未写入，也不能再次用旧会话覆盖。
    doc.valid = false;
    let guard = open_source(&doc.path).map_err(|e| {
        format!(
            "The file WAS SAVED, but could not be reopened: {e}. Reopen the file. Backup: {}",
            backup.display()
        )
    })?;
    doc.stamp = Stamp::of(&guard)?;
    doc.guard = guard;
    doc.valid = true;
    doc.buffer.mark_saved();
    if let Some(previous) = doc.backup.replace(backup.clone()) {
        let _ = std::fs::remove_file(previous);
    }
    #[cfg(unix)]
    {
        if let Ok(directory) = File::open(parent) {
            let _ = directory.sync_all();
        }
    }
    Ok(backup.to_string_lossy().into_owned())
}
