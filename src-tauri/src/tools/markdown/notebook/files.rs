//! 磁盘上的 Markdown 是正文，索引只记录界面信息及最近读取或写入的正文摘要。
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{self, Write as _},
    path::{Component, Path, PathBuf},
};

use super::{
    assets::{self, AssetCopy},
    paths::{check_link, invalid, notes_path, path_key, remove_empty_dir},
};

const INDEX: &str = "index.json";
const LEGACY: &str = "notebook.json";
const PENDING: &str = "pending.json";

#[derive(Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Book<T> {
    version: u8,
    selected_id: Option<String>,
    nodes: Vec<Entry<T>>,
}

#[derive(Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Entry<T> {
    id: String,
    parent_id: Option<String>,
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
    #[serde(flatten)]
    kind: Kind<T>,
}

#[derive(Deserialize, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Kind<T> {
    Folder {
        collapsed: bool,
    },
    Note {
        #[serde(flatten)]
        body: T,
    },
}

#[derive(Deserialize, Serialize)]
struct Text {
    markdown: String,
}

#[derive(Deserialize, Serialize, PartialEq)]
struct Checksum {
    digest: String,
}

impl<T> Entry<T> {
    fn is_folder(&self) -> bool {
        matches!(self.kind, Kind::Folder { .. })
    }

    fn map_body<U>(&self, map: impl FnOnce(&T) -> io::Result<U>) -> io::Result<Entry<U>> {
        Ok(Entry {
            id: self.id.clone(),
            name: self.name.clone(),
            file_name: None,
            parent_id: self.parent_id.clone(),
            kind: match &self.kind {
                Kind::Folder { collapsed } => Kind::Folder {
                    collapsed: *collapsed,
                },
                Kind::Note { body } => Kind::Note { body: map(body)? },
            },
        })
    }
}

#[derive(Deserialize, Serialize)]
struct Plan {
    index: Book<Checksum>,
    create_dirs: Vec<PathBuf>,
    #[serde(default)]
    asset_copies: Vec<AssetCopy>,
    writes: Vec<Write>,
    remove_files: Vec<Removal>,
    remove_dirs: Vec<PathBuf>,
}

#[derive(Deserialize, Serialize)]
struct Write {
    path: PathBuf,
    markdown: String,
    previous: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct Removal {
    path: PathBuf,
    digest: String,
}

fn digest(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

fn title_without_extension<T>(entry: &Entry<T>) -> &str {
    if entry.is_folder() {
        &entry.name
    } else {
        match entry.name.rsplit_once('.') {
            Some((stem, extension)) if extension.eq_ignore_ascii_case("md") => stem,
            _ => &entry.name,
        }
    }
}

fn clean_title(title: &str, limit: usize) -> String {
    title
        .chars()
        .take(limit)
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect()
}

fn numbered_name<T>(entry: &Entry<T>, number: usize) -> String {
    let mut title = clean_title(title_without_extension(entry), 220);
    let mut limit = title.len().min(220);
    while !title.is_char_boundary(limit) {
        limit -= 1;
    }
    title.truncate(limit);
    let title = title.trim_matches([' ', '.']);
    let device = title
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end()
        .to_ascii_uppercase();
    let reserved = matches!(
        device.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|prefix| {
        device.strip_prefix(prefix).is_some_and(|port| {
            matches!(
                port,
                "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    });
    let title = if title.is_empty() {
        "_".to_owned()
    } else if reserved {
        format!("_{title}")
    } else {
        title.to_owned()
    };
    let suffix = if number == 1 {
        String::new()
    } else {
        format!(" ({number})")
    };
    let extension = if entry.is_folder() { "" } else { ".md" };
    format!("{title}{suffix}{extension}")
}

fn previous_hashed_name<T>(entry: &Entry<T>) -> String {
    let title = if entry.is_folder() {
        &entry.name
    } else {
        entry.name.strip_suffix(".md").unwrap_or(&entry.name)
    };
    let title = clean_title(title, 36);
    let title = title.trim_matches([' ', '.']);
    // Windows 保留设备名不能作文件名。替换点号也避免 CON.foo 等保留形式。
    let title = title.replace('.', "_");
    let title = if title.is_empty() { "_" } else { &title };
    let key = digest(&format!("{}:{}{}", entry.id.len(), entry.id, entry.name));
    let extension = if entry.is_folder() { "" } else { ".md" };
    format!("{title}--{}{extension}", &key[..16])
}

fn layout<T>(
    book: &Book<T>,
    mut file_name: impl FnMut(&Entry<T>, &Path) -> io::Result<String>,
) -> io::Result<Vec<PathBuf>> {
    if book.version != 1 {
        return Err(invalid("Unsupported notebook format"));
    }
    let mut ids = HashSet::new();
    let mut children: HashMap<Option<&str>, Vec<usize>> = HashMap::new();
    for (i, entry) in book.nodes.iter().enumerate() {
        if entry.id.is_empty() || entry.name.trim().is_empty() || !ids.insert(&entry.id) {
            return Err(invalid("Invalid notebook entry"));
        }
        children
            .entry(entry.parent_id.as_deref())
            .or_default()
            .push(i);
    }
    let mut paths = vec![PathBuf::new(); book.nodes.len()];
    let mut stack = vec![(None, PathBuf::new())];
    let mut visited = 0;
    while let Some((parent, path)) = stack.pop() {
        for &i in children.get(&parent).into_iter().flatten() {
            let entry = &book.nodes[i];
            let name = file_name(entry, &path)?;
            let mut components = Path::new(&name).components();
            if !matches!(components.next(), Some(Component::Normal(part)) if part == name.as_str())
                || components.next().is_some()
            {
                return Err(invalid("Invalid notebook file name"));
            }
            paths[i] = path.join(name);
            visited += 1;
            if entry.is_folder() {
                stack.push((Some(entry.id.as_str()), paths[i].clone()));
            }
        }
    }
    if visited != book.nodes.len() {
        return Err(invalid("Invalid notebook hierarchy"));
    }
    Ok(paths)
}

fn stored_layout(book: &Book<Checksum>) -> io::Result<Vec<PathBuf>> {
    layout(book, |entry, _| {
        Ok(entry
            .file_name
            .clone()
            .unwrap_or_else(|| previous_hashed_name(entry)))
    })
}

fn read_optional(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> io::Result<Option<T>> {
    read_optional(path)?
        .map(|text| serde_json::from_str(&text).map_err(io::Error::from))
        .transpose()
}

fn write_json(path: &Path, value: &impl Serialize) -> io::Result<()> {
    write_atomic(path, &serde_json::to_vec(value)?)
}

fn write_atomic(path: &Path, data: &[u8]) -> io::Result<()> {
    // 通过同目录的临时文件原子替换正文、索引或保存日志。
    let parent = path.parent().ok_or(io::ErrorKind::InvalidInput)?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(data)?;
    temp.as_file().sync_all()?;
    temp.persist(path)?;
    Ok(())
}

fn prepare(dir: &Path, book: Book<Text>, previous: Option<&Book<Checksum>>) -> io::Result<Plan> {
    let old_paths = previous.map(stored_layout).transpose()?.unwrap_or_default();
    let old: HashMap<_, _> = previous
        .into_iter()
        .flat_map(|index| index.nodes.iter())
        .zip(&old_paths)
        .map(|(entry, path)| (entry.id.as_str(), (entry, path)))
        .collect();
    let owners: HashMap<_, _> = old
        .iter()
        .map(|(&id, (_, path))| (path_key(path), id))
        .collect();
    let mut reserved = HashSet::new();
    let paths = layout(&book, |entry, parent| {
        let previous = old.get(entry.id.as_str());
        if let Some((old_entry, old_path)) = previous {
            if old_entry.name == entry.name
                && old_entry.is_folder() == entry.is_folder()
                && old_path.parent() == Some(parent)
            {
                if let Some(name) = &old_entry.file_name {
                    reserved.insert(path_key(old_path));
                    return Ok(name.clone());
                }
            }
        }
        for number in 1.. {
            let name = numbered_name(entry, number);
            let path = parent.join(&name);
            let key = path_key(&path);
            if reserved.contains(&key) {
                continue;
            }
            if let Some(owner) = owners.get(&key) {
                if *owner != entry.id {
                    continue;
                }
                if let Some((old_entry, old_path)) = previous {
                    if old_entry.is_folder() != entry.is_folder() {
                        continue;
                    }
                    // Windows 将仅大小写不同的路径视为同一个文件。
                    if old_path.parent() == Some(parent) {
                        reserved.insert(key);
                        return Ok(old_path.file_name().unwrap().to_string_lossy().into_owned());
                    }
                }
                continue;
            }
            match fs::symlink_metadata(notes_path(dir, &path)?) {
                Ok(_) => continue,
                Err(error) if error.kind() == io::ErrorKind::NotFound => (),
                Err(error) => return Err(error),
            }
            reserved.insert(key);
            return Ok(name);
        }
        unreachable!()
    })?;
    let mut writes = Vec::new();
    let mut asset_copies = Vec::new();
    let mut copied_assets = HashSet::new();
    let mut create_dirs = Vec::new();
    let mut remove_files = Vec::new();
    let mut remove_dirs = Vec::new();
    let next: HashMap<_, _> = book
        .nodes
        .iter()
        .zip(&paths)
        .map(|(entry, path)| (entry.id.as_str(), path))
        .collect();

    for (id, (entry, path)) in &old {
        if next.get(id) == Some(path) {
            continue;
        }
        if entry.is_folder() {
            remove_dirs.push((*path).clone());
        } else if let Some(text) = read_optional(&notes_path(dir, path)?)? {
            remove_files.push(Removal {
                path: (*path).clone(),
                digest: digest(&text),
            });
        }
    }

    let nodes = book
        .nodes
        .iter()
        .zip(paths)
        .map(|(entry, path)| {
            if entry.is_folder()
                && !old
                    .get(entry.id.as_str())
                    .is_some_and(|(_, old_path)| *old_path == &path)
            {
                create_dirs.push(path.clone());
            }
            let mut indexed = entry.map_body(|body| {
                let desired = digest(&body.markdown);
                let previous =
                    old.get(entry.id.as_str())
                        .and_then(|(entry, path)| match &entry.kind {
                            Kind::Note { body } => Some((body, *path)),
                            Kind::Folder { .. } => None,
                        });
                if let Some((checksum, old_path)) = previous {
                    if old_path == &path && checksum.digest == desired {
                        return Ok(Checksum { digest: desired });
                    }
                }

                let same_path = previous.is_some_and(|(_, old_path)| old_path == &path);
                let current = read_optional(&notes_path(dir, &path)?)?;
                if !same_path && current.is_some() {
                    return Err(invalid("A file already exists at the notebook destination"));
                }
                // 移动或重命名未在笔记本里编辑的笔记时，使用磁盘上当前的正文。
                let markdown = match previous {
                    Some((checksum, old_path)) if checksum.digest == desired => {
                        fs::read_to_string(notes_path(dir, old_path)?)?
                    }
                    _ => body.markdown.clone(),
                };
                if let Some((_, old_path)) = previous {
                    asset_copies.extend(assets::plan_image_copies(
                        dir,
                        old_path,
                        &path,
                        &markdown,
                        &mut copied_assets,
                    )?);
                }
                writes.push(Write {
                    path: path.clone(),
                    markdown,
                    previous: current.as_deref().map(digest),
                });
                Ok(Checksum { digest: desired })
            })?;
            indexed.file_name = Some(path.file_name().unwrap().to_string_lossy().into_owned());
            Ok(indexed)
        })
        .collect::<io::Result<Vec<_>>>()?;

    // 先清理子目录，保留目录内任何不属于笔记本的文件。
    remove_dirs.sort_by_key(|path| std::cmp::Reverse(path.components().count()));
    Ok(Plan {
        index: Book {
            version: 1,
            selected_id: book.selected_id,
            nodes,
        },
        create_dirs,
        asset_copies,
        writes,
        remove_files,
        remove_dirs,
    })
}

fn apply(dir: &Path, plan: &Plan) -> io::Result<()> {
    let index_path = dir.join(INDEX);
    if read_json::<Book<Checksum>>(&index_path)?.as_ref() != Some(&plan.index) {
        for path in &plan.create_dirs {
            fs::create_dir_all(notes_path(dir, path)?)?;
        }
        // 先在新目录建立附件，索引提交后再检查旧附件能否移除。
        assets::copy_images(dir, &plan.asset_copies)?;
        for write in &plan.writes {
            let path = notes_path(dir, &write.path)?;
            let current = read_optional(&path)?;
            if current.as_deref() == Some(&write.markdown) {
                continue;
            }
            if current.as_deref().map(digest) != write.previous {
                return Err(invalid("A notebook file changed while saving"));
            }
            fs::create_dir_all(
                path.parent()
                    .ok_or_else(|| invalid("Missing notebook directory"))?,
            )?;
            write_atomic(&path, write.markdown.as_bytes())?;
        }
        write_json(&index_path, &plan.index)?;
    }
    // 索引提交后再清理旧路径。日志保留到清理完成，重启时可以继续。
    for removal in &plan.remove_files {
        let path = notes_path(dir, &removal.path)?;
        if read_optional(&path)?.as_deref().map(digest).as_ref() == Some(&removal.digest) {
            fs::remove_file(path)?;
        }
    }
    if !plan.asset_copies.is_empty() {
        let managed_dirs: HashSet<_> = plan
            .index
            .nodes
            .iter()
            .zip(stored_layout(&plan.index)?)
            .filter(|(entry, _)| entry.is_folder())
            .map(|(_, path)| path_key(&path))
            .collect();
        assets::remove_unused_moved_images(dir, &plan.asset_copies, &managed_dirs)?;
    }
    for relative in &plan.remove_dirs {
        remove_empty_dir(&notes_path(dir, relative)?)?;
    }
    fs::remove_file(dir.join(PENDING))
}

fn recover(dir: &Path) -> io::Result<()> {
    if let Some(plan) = read_json(&dir.join(PENDING))? {
        apply(dir, &plan)?;
    }
    Ok(())
}

fn commit(dir: &Path, book: Book<Text>) -> io::Result<()> {
    let previous = read_json(&dir.join(INDEX))?;
    let plan = prepare(dir, book, previous.as_ref())?;
    if previous.as_ref() != Some(&plan.index) {
        write_json(&dir.join(PENDING), &plan)?;
        apply(dir, &plan)?;
    }
    Ok(())
}

pub(super) fn read(dir: &Path) -> io::Result<Option<String>> {
    check_link(dir)?;
    recover(dir)?;
    let index_path = dir.join(INDEX);
    if !index_path.exists() {
        let Some(legacy) = read_json(&dir.join(LEGACY))? else {
            return Ok(None);
        };
        commit(dir, legacy)?;
    }
    let mut index: Book<Checksum> =
        read_json(&index_path)?.ok_or_else(|| invalid("Missing notebook index"))?;
    let paths = stored_layout(&index)?;
    let uses_hashed_names = index.nodes.iter().any(|entry| entry.file_name.is_none());
    let mut refreshed = false;
    let mut nodes = Vec::with_capacity(index.nodes.len());
    for (entry, path) in index.nodes.iter_mut().zip(paths) {
        if entry.is_folder() && !notes_path(dir, &path)?.is_dir() {
            return Err(invalid("Notebook folder not found"));
        }
        let mut actual = None;
        nodes.push(entry.map_body(|body| {
            let markdown = fs::read_to_string(notes_path(dir, &path)?)?;
            let current = digest(&markdown);
            if current != body.digest {
                actual = Some(current);
            }
            Ok(Text { markdown })
        })?);
        if let (Some(current), Kind::Note { body }) = (actual, &mut entry.kind) {
            body.digest = current;
            refreshed = true;
        }
    }
    if refreshed {
        write_json(&index_path, &index)?;
    }
    let book = Book {
        version: 1,
        selected_id: index.selected_id,
        nodes,
    };
    if uses_hashed_names {
        commit(dir, book)?;
        return read(dir);
    }
    let snapshot = serde_json::to_string(&book)?;
    // 只有索引和所有正文都已成功读回，才删除旧存档。
    match fs::remove_file(dir.join(LEGACY)) {
        Ok(()) => (),
        Err(error) if error.kind() == io::ErrorKind::NotFound => (),
        Err(error) => return Err(error),
    }
    Ok(Some(snapshot))
}

pub(super) fn write(dir: &Path, data: &str) -> io::Result<()> {
    check_link(dir)?;
    recover(dir)?;
    commit(dir, serde_json::from_str(data)?)
}

fn entry_relative_path(dir: &Path, id: &str) -> io::Result<(PathBuf, bool)> {
    check_link(dir)?;
    recover(dir)?;
    let index: Book<Checksum> =
        read_json(&dir.join(INDEX))?.ok_or_else(|| invalid("Missing notebook index"))?;
    let (entry, path) = index
        .nodes
        .iter()
        .zip(stored_layout(&index)?)
        .find(|(entry, _)| entry.id == id)
        .ok_or_else(|| invalid("Notebook entry not found"))?;
    Ok((path, entry.is_folder()))
}

fn image_note_path(dir: &Path, id: &str) -> io::Result<PathBuf> {
    let (path, is_folder) = entry_relative_path(dir, id)?;
    if is_folder {
        return Err(invalid("Invalid notebook image reference"));
    }
    Ok(path)
}

pub(super) fn save_image(dir: &Path, id: &str, data: &[u8]) -> io::Result<String> {
    assets::save_image(dir, data, || image_note_path(dir, id))
}

pub(super) fn read_image(dir: &Path, id: &str, name: &str) -> io::Result<Vec<u8>> {
    assets::read_image(dir, &image_note_path(dir, id)?, name)
}

#[cfg(windows)]
pub(super) fn entry_path(dir: &Path, id: &str) -> io::Result<(PathBuf, bool)> {
    let (path, is_folder) = entry_relative_path(dir, id)?;
    let path = notes_path(dir, &path)?;
    let metadata = fs::metadata(&path)?;
    if (is_folder && !metadata.is_dir()) || (!is_folder && !metadata.is_file()) {
        return Err(invalid("Unexpected notebook entry type"));
    }
    Ok((path, is_folder))
}
