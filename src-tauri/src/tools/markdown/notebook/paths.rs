//! 笔记本目录的路径校验和安全操作。
use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

const NOTES: &str = "notes";

pub(super) fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}

pub(super) fn path_key(path: &Path) -> String {
    path.to_string_lossy().to_uppercase()
}

pub(super) fn check_link(path: &Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    return Err(invalid("Notebook paths cannot contain reparse points"));
                }
            }
            if metadata.is_symlink() {
                return Err(invalid("Notebook paths cannot contain symbolic links"));
            }
            Ok(())
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

pub(super) fn notes_path(dir: &Path, relative: &Path) -> io::Result<PathBuf> {
    let mut path = dir.join(NOTES);
    check_link(&path)?;
    for part in relative.components() {
        let Component::Normal(part) = part else {
            return Err(invalid("Invalid notebook path"));
        };
        path.push(part);
        check_link(&path)?;
    }
    Ok(path)
}

pub(super) fn remove_empty_dir(path: &Path) -> io::Result<()> {
    match fs::remove_dir(path) {
        Ok(()) => Ok(()),
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::DirectoryNotEmpty
            ) =>
        {
            Ok(())
        }
        Err(error) => Err(error),
    }
}
