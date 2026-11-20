//! 笔记附件的命名、读写及移动后的旧副本清理。
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{self, Write as _},
    path::{Path, PathBuf},
};

use super::paths::{check_link, invalid, notes_path, path_key, remove_empty_dir};

const ASSETS: &str = "assets";
const IMAGE_PREFIX: &str = "image-";

#[derive(Deserialize, Serialize, PartialEq, Eq, Hash, Clone)]
pub(super) struct AssetCopy {
    from: PathBuf,
    to: PathBuf,
}

fn write_image(path: &Path, data: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or(io::ErrorKind::InvalidInput)?;
    fs::create_dir_all(parent)?;
    match fs::read(path) {
        Ok(existing) if existing == data => return Ok(()),
        Ok(_) => {
            return Err(invalid(
                "A different notebook image already exists at the destination",
            ))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => (),
        Err(error) => return Err(error),
    }
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(data)?;
    temp.as_file().sync_all()?;
    temp.persist_noclobber(path)?;
    Ok(())
}

pub(super) fn save_image(
    dir: &Path,
    data: &[u8],
    note_path: impl FnOnce() -> io::Result<PathBuf>,
) -> io::Result<String> {
    let ext = match data {
        data if data.starts_with(b"\x89PNG\r\n\x1a\n") => "png",
        [0xff, 0xd8, 0xff, ..] => "jpg",
        data if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") => "gif",
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => "webp",
        [b'B', b'M', ..] => "bmp",
        [_, _, _, _, b'f', b't', b'y', b'p', b'a', b'v', b'i', b'f' | b's', ..] => "avif",
        _ => return Err(invalid("Unsupported notebook image format")),
    };
    let name = format!("{IMAGE_PREFIX}{:x}.{ext}", Sha256::digest(data));
    let path = notes_path(dir, &image_path(&note_path()?, &name)?)?;
    write_image(&path, data)?;
    Ok(format!("{ASSETS}/{name}"))
}

fn image_path(note: &Path, name: &str) -> io::Result<PathBuf> {
    if image_extension(name).is_none() {
        return Err(invalid("Invalid notebook image reference"));
    }
    Ok(note.with_file_name(ASSETS).join(name))
}

pub(super) fn read_image(dir: &Path, note: &Path, name: &str) -> io::Result<Vec<u8>> {
    fs::read(notes_path(dir, &image_path(note, name)?)?)
}

fn image_extension(name: &str) -> Option<&str> {
    let (hash, ext) = name.strip_prefix(IMAGE_PREFIX)?.split_once('.')?;
    (hash.len() == 64
        && hash
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        && matches!(ext, "png" | "jpg" | "gif" | "webp" | "bmp" | "avif"))
    .then_some(ext)
}

fn referenced_images(markdown: &str) -> impl Iterator<Item = &str> {
    markdown
        .match_indices("assets/image-")
        .filter_map(|(offset, _)| {
            let tail = &markdown[offset + ASSETS.len() + 1..];
            let end = tail
                .find(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '.')
                .unwrap_or(tail.len());
            let name = &tail[..end];
            image_extension(name).map(|_| name)
        })
}

fn directory_image_references(dir: &Path) -> io::Result<HashSet<String>> {
    let mut images = HashSet::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
            && !entry.file_type()?.is_dir()
        {
            check_link(&path)?;
            images.extend(referenced_images(&fs::read_to_string(path)?).map(str::to_owned));
        }
    }
    Ok(images)
}

pub(super) fn plan_image_copies(
    dir: &Path,
    old_note: &Path,
    new_note: &Path,
    markdown: &str,
    copied: &mut HashSet<AssetCopy>,
) -> io::Result<Vec<AssetCopy>> {
    let mut copies = Vec::new();
    if old_note.parent() == new_note.parent() {
        return Ok(copies);
    }
    for name in referenced_images(markdown) {
        let copy = AssetCopy {
            from: old_note.with_file_name(ASSETS).join(name),
            to: new_note.with_file_name(ASSETS).join(name),
        };
        if notes_path(dir, &copy.from)?.is_file() && copied.insert(copy.clone()) {
            copies.push(copy);
        }
    }
    Ok(copies)
}

pub(super) fn copy_images(dir: &Path, copies: &[AssetCopy]) -> io::Result<()> {
    for copy in copies {
        let data = fs::read(notes_path(dir, &copy.from)?)?;
        write_image(&notes_path(dir, &copy.to)?, &data)?;
    }
    Ok(())
}

pub(super) fn remove_unused_moved_images(
    dir: &Path,
    copies: &[AssetCopy],
    managed_dirs: &HashSet<String>,
) -> io::Result<()> {
    let mut references = HashMap::new();
    let mut removed = HashSet::new();
    for copy in copies {
        let Some(name) = copy.from.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(assets) = copy.from.parent() else {
            continue;
        };
        if assets.file_name().and_then(|name| name.to_str()) != Some(ASSETS)
            || image_extension(name).is_none()
            || path_key(&copy.from) == path_key(&copy.to)
            || removed.contains(&copy.from)
        {
            continue;
        }
        let path = notes_path(dir, &copy.from)?;
        let assets_dir = notes_path(dir, assets)?;
        let Some(parent) = assets_dir.parent() else {
            continue;
        };
        let refs = references
            .entry(parent.to_path_buf())
            .or_insert_with(|| directory_image_references(parent).ok());
        // 旧目录中可能还有其他笔记，读取失败时保留附件。
        if refs.as_ref().is_none_or(|refs| refs.contains(name)) {
            continue;
        }
        let Ok(data) = fs::read(&path) else {
            continue;
        };
        let target = notes_path(dir, &copy.to)?;
        if !fs::read(target).is_ok_and(|target| target == data) {
            continue;
        }
        fs::remove_file(path)?;
        removed.insert(&copy.from);
        if !managed_dirs.contains(&path_key(assets)) {
            remove_empty_dir(&assets_dir)?;
        }
    }
    Ok(())
}
