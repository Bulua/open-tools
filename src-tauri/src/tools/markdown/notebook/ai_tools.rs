//! 将「笔记本」目录浏览、关键词检索、正文读取与新建/更新/删除能力封装为统一 `AiTool`。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

use crate::tools::ai::args;
use crate::tools::ai::registry::{
    AiTool, AiToolContext, AiToolFuture, AiToolResult, ToolApprovalPolicy,
};

use super::files::{Book, Entry, Kind, Text};
use super::store;

const MAX_NOTE_BYTES: usize = 2 * 1024 * 1024;
const SNIPPET_RADIUS_CHARS: usize = 45;

static NEXT_ID_SEQ: AtomicU64 = AtomicU64::new(1);

fn generate_entry_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = NEXT_ID_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{nanos:x}_{seq:x}")
}

fn normalize_logical_path(raw: &str) -> String {
    raw.replace('\\', "/")
        .split('/')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn strip_md_suffix(name: &str) -> &str {
    match name.rsplit_once('.') {
        Some((stem, ext)) if ext.eq_ignore_ascii_case("md") && !stem.is_empty() => stem,
        _ => name,
    }
}

fn names_match(candidate: &str, target: &str) -> bool {
    let a = strip_md_suffix(candidate.trim());
    let b = strip_md_suffix(target.trim());
    a == b || a.to_lowercase() == b.to_lowercase()
}

fn entry_markdown(entry: &Entry<Text>) -> Option<&str> {
    match &entry.kind {
        Kind::Note { body } => Some(body.markdown.as_str()),
        Kind::Folder { .. } => None,
    }
}

/// 计算每个节点的逻辑路径（如 `工作/周报`）与层级深度。
fn compute_node_paths(book: &Book<Text>) -> Vec<(usize, String, usize)> {
    let mut children: HashMap<Option<&str>, Vec<usize>> = HashMap::new();
    for (idx, entry) in book.nodes.iter().enumerate() {
        children
            .entry(entry.parent_id.as_deref())
            .or_default()
            .push(idx);
    }

    let mut out = Vec::with_capacity(book.nodes.len());
    fn walk<'a>(
        parent: Option<&'a str>,
        prefix: &str,
        depth: usize,
        book: &'a Book<Text>,
        children: &HashMap<Option<&'a str>, Vec<usize>>,
        out: &mut Vec<(usize, String, usize)>,
    ) {
        if let Some(indices) = children.get(&parent) {
            for &idx in indices {
                let entry = &book.nodes[idx];
                let path = if prefix.is_empty() {
                    entry.name.clone()
                } else {
                    format!("{prefix}/{}", entry.name)
                };
                out.push((idx, path.clone(), depth));
                if entry.is_folder() {
                    walk(Some(entry.id.as_str()), &path, depth + 1, book, children, out);
                }
            }
        }
    }

    walk(None, "", 0, book, &children, &mut out);
    out
}

fn find_folder_by_id_or_path(book: &Book<Text>, query: &str) -> Option<(usize, String)> {
    let trimmed = query.trim();
    let normalized = normalize_logical_path(trimmed);
    let paths = compute_node_paths(book);

    // 优先按 ID 精确匹配
    if let Some((idx, path, _)) = paths
        .iter()
        .find(|(idx, _, _)| book.nodes[*idx].is_folder() && book.nodes[*idx].id == trimmed)
    {
        return Some((*idx, path.clone()));
    }

    // 再按完整路径匹配（不区分大小写）
    let target_lower = normalized.to_lowercase();
    paths
        .into_iter()
        .find(|(idx, path, _)| {
            book.nodes[*idx].is_folder() && path.to_lowercase() == target_lower
        })
        .map(|(idx, path, _)| (idx, path))
}

enum NoteMatch {
    One(usize, String),
    None,
    Ambiguous(Vec<(String, String)>),
}

fn find_note(book: &Book<Text>, id: Option<&str>, path_or_name: Option<&str>) -> NoteMatch {
    let paths = compute_node_paths(book);

    if let Some(target_id) = id {
        return match paths
            .iter()
            .find(|(idx, _, _)| !book.nodes[*idx].is_folder() && book.nodes[*idx].id == target_id)
        {
            Some((idx, path, _)) => NoteMatch::One(*idx, path.clone()),
            None => NoteMatch::None,
        };
    }

    let Some(raw) = path_or_name else {
        return NoteMatch::None;
    };
    let normalized = normalize_logical_path(raw);
    if normalized.is_empty() {
        return NoteMatch::None;
    }

    // 1. 完整路径匹配（兼容带或不带 .md 后缀）
    let normalized_no_ext = match normalized.rsplit_once('/') {
        Some((dir, leaf)) => format!("{dir}/{}", strip_md_suffix(leaf)),
        None => strip_md_suffix(&normalized).to_string(),
    };
    let target_lower = normalized_no_ext.to_lowercase();

    let exact_path_hits: Vec<(usize, String)> = paths
        .iter()
        .filter(|(idx, _, _)| !book.nodes[*idx].is_folder())
        .filter(|(_, path, _)| {
            let candidate = match path.rsplit_once('/') {
                Some((dir, leaf)) => format!("{dir}/{}", strip_md_suffix(leaf)),
                None => strip_md_suffix(path).to_string(),
            };
            candidate.to_lowercase() == target_lower
        })
        .map(|(idx, path, _)| (*idx, path.clone()))
        .collect();

    if exact_path_hits.len() == 1 {
        let (idx, path) = exact_path_hits.into_iter().next().unwrap();
        return NoteMatch::One(idx, path);
    }
    if exact_path_hits.len() > 1 {
        return NoteMatch::Ambiguous(
            exact_path_hits
                .into_iter()
                .map(|(idx, path)| (book.nodes[idx].id.clone(), path))
                .collect(),
        );
    }

    // 2. 若未含斜杠，则按笔记名称在全部目录中匹配
    if !normalized.contains('/') {
        let name_hits: Vec<(usize, String)> = paths
            .iter()
            .filter(|(idx, _, _)| {
                !book.nodes[*idx].is_folder() && names_match(&book.nodes[*idx].name, &normalized)
            })
            .map(|(idx, path, _)| (*idx, path.clone()))
            .collect();

        if name_hits.len() == 1 {
            let (idx, path) = name_hits.into_iter().next().unwrap();
            return NoteMatch::One(idx, path);
        }
        if name_hits.len() > 1 {
            return NoteMatch::Ambiguous(
                name_hits
                    .into_iter()
                    .map(|(idx, path)| (book.nodes[idx].id.clone(), path))
                    .collect(),
            );
        }
    }

    NoteMatch::None
}

fn build_excerpt(markdown: &str, needle_lower: &str) -> Option<String> {
    let lower = markdown.to_lowercase();
    let byte_pos = lower.find(needle_lower)?;
    let chars: Vec<(usize, char)> = markdown.char_indices().collect();
    let match_char_idx = chars
        .iter()
        .position(|(idx, _)| *idx >= byte_pos)
        .unwrap_or(0);
    let start = match_char_idx.saturating_sub(SNIPPET_RADIUS_CHARS);
    let end = (match_char_idx + needle_lower.chars().count() + SNIPPET_RADIUS_CHARS)
        .min(chars.len());
    let snippet: String = chars[start..end]
        .iter()
        .map(|(_, ch)| if *ch == '\r' || *ch == '\n' { ' ' } else { *ch })
        .collect();
    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if end < chars.len() { "…" } else { "" };
    Some(format!("{prefix}{}{suffix}", snippet.trim()))
}

fn ensure_folder_path(book: &mut Book<Text>, folder_spec: &str) -> Result<Option<String>, String> {
    let trimmed = folder_spec.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    // 允许直接传已有文件夹 ID
    if let Some(existing) = book
        .nodes
        .iter()
        .find(|entry| entry.is_folder() && entry.id == trimmed)
    {
        return Ok(Some(existing.id.clone()));
    }

    let normalized = normalize_logical_path(trimmed);
    if normalized.is_empty() {
        return Ok(None);
    }

    let mut parent_id: Option<String> = None;
    for segment in normalized.split('/') {
        let existing_id = book
            .nodes
            .iter()
            .find(|entry| {
                entry.is_folder()
                    && entry.parent_id == parent_id
                    && entry.name.to_lowercase() == segment.to_lowercase()
            })
            .map(|entry| entry.id.clone());

        if let Some(id) = existing_id {
            parent_id = Some(id);
        } else {
            let mut id = generate_entry_id("folder");
            while book.nodes.iter().any(|entry| entry.id == id) {
                id = generate_entry_id("folder");
            }
            book.nodes.push(Entry {
                id: id.clone(),
                parent_id: parent_id.clone(),
                name: segment.to_string(),
                file_name: None,
                kind: Kind::Folder { collapsed: false },
            });
            parent_id = Some(id);
        }
    }
    Ok(parent_id)
}

fn parse_save_target(
    folder: Option<String>,
    name: Option<String>,
    path: Option<String>,
) -> Result<(Option<String>, String), String> {
    if let Some(raw_path) = path {
        let normalized = normalize_logical_path(&raw_path);
        if normalized.is_empty() {
            return Err("Parameter 'path' must not be empty.".to_string());
        }
        return match normalized.rsplit_once('/') {
            Some((dir, leaf)) => {
                let leaf = strip_md_suffix(leaf).trim().to_string();
                if leaf.is_empty() {
                    return Err("Note name in 'path' must not be empty.".to_string());
                }
                let combined_folder = match folder {
                    Some(base) => {
                        let base = normalize_logical_path(&base);
                        if base.is_empty() {
                            Some(dir.to_string())
                        } else {
                            Some(format!("{base}/{dir}"))
                        }
                    }
                    None => Some(dir.to_string()),
                };
                Ok((combined_folder, leaf))
            }
            None => Ok((folder, strip_md_suffix(&normalized).trim().to_string())),
        };
    }

    let note_name = name
        .map(|n| strip_md_suffix(n.trim()).trim().to_string())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| "Provide 'id' to update a note, or 'name'/'path' to create or locate one.".to_string())?;
    Ok((folder, note_name))
}

pub(crate) struct NotebookListTool;

impl AiTool for NotebookListTool {
    fn name(&self) -> &'static str {
        "notebook_list"
    }

    fn description(&self) -> &'static str {
        "List folders and notes in the Open Tools Notebook, optionally filtered by a folder or searched by keyword across titles and Markdown content."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "folder": {
                    "type": "string",
                    "description": "Optional folder ID or path (e.g. '工作/周报') to scope the listing."
                },
                "query": {
                    "type": "string",
                    "description": "Optional case-insensitive keyword to search in note titles, paths, and Markdown content."
                }
            }
        })
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let folder_filter = args::trimmed(&args, "folder");
            let query = args::trimmed(&args, "query");

            let book = match store::read_book(ctx.app) {
                Ok(b) => b,
                Err(err) => return AiToolResult::err(err),
            };
            if book.nodes.is_empty() {
                return AiToolResult::ok("Notebook is currently empty.");
            }

            let scope_prefix = if let Some(ref folder) = folder_filter {
                match find_folder_by_id_or_path(&book, folder) {
                    Some((_, path)) => Some(path),
                    None => {
                        return AiToolResult::err(format!(
                            "Notebook folder not found: '{folder}'."
                        ));
                    }
                }
            } else {
                None
            };

            let all_paths = compute_node_paths(&book);
            let scoped: Vec<(usize, String, usize)> = match scope_prefix.as_deref() {
                Some(prefix) => {
                    let slash_prefix = format!("{prefix}/");
                    let base_depth = prefix.split('/').count();
                    all_paths
                        .into_iter()
                        .filter(|(_, path, _)| path.starts_with(&slash_prefix))
                        .map(|(idx, path, depth)| (idx, path, depth.saturating_sub(base_depth)))
                        .collect()
                }
                None => all_paths,
            };

            if let Some(keyword) = query {
                let needle = keyword.to_lowercase();
                let mut matches = Vec::new();
                for (idx, path, _) in &scoped {
                    let entry = &book.nodes[*idx];
                    let Some(markdown) = entry_markdown(entry) else {
                        continue;
                    };
                    let title_hit = path.to_lowercase().contains(&needle);
                    let snippet = build_excerpt(markdown, &needle);
                    if title_hit || snippet.is_some() {
                        match snippet {
                            Some(excerpt) => matches.push(format!(
                                "- {path} (id: {}) — {excerpt}",
                                entry.id
                            )),
                            None => matches.push(format!("- {path} (id: {})", entry.id)),
                        }
                    }
                }
                if matches.is_empty() {
                    return AiToolResult::ok(format!(
                        "No notes matched query '{keyword}'."
                    ));
                }
                return AiToolResult::ok(format!(
                    "Matched {} note(s) for '{keyword}':\n{}",
                    matches.len(),
                    matches.join("\n")
                ));
            }

            if scoped.is_empty() {
                return AiToolResult::ok(format!(
                    "Folder '{}' is empty.",
                    scope_prefix.unwrap_or_default()
                ));
            }

            let note_count = scoped
                .iter()
                .filter(|(idx, _, _)| !book.nodes[*idx].is_folder())
                .count();
            let folder_count = scoped.len() - note_count;
            let header = match scope_prefix {
                Some(prefix) => format!(
                    "Notebook folder '{prefix}' ({folder_count} folders, {note_count} notes):"
                ),
                None => format!("Notebook ({folder_count} folders, {note_count} notes):"),
            };

            let mut lines = vec![header];
            for (idx, path, depth) in scoped {
                let entry = &book.nodes[idx];
                let indent = "  ".repeat(depth);
                if entry.is_folder() {
                    lines.push(format!("{indent}[folder] {path}/ (id: {})", entry.id));
                } else {
                    let chars = entry_markdown(entry).map(|m| m.chars().count()).unwrap_or(0);
                    lines.push(format!(
                        "{indent}[note]   {path} (id: {}, {chars} chars)",
                        entry.id
                    ));
                }
            }
            AiToolResult::ok(lines.join("\n"))
        })
    }
}

pub(crate) struct NotebookReadTool;

impl AiTool for NotebookReadTool {
    fn name(&self) -> &'static str {
        "notebook_read"
    }

    fn description(&self) -> &'static str {
        "Read the full Markdown content of a note in the Open Tools Notebook by its ID or logical path/name."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Exact note ID (from notebook_list)."
                },
                "path": {
                    "type": "string",
                    "description": "Logical note path (e.g. '工作/周报') or bare note title."
                }
            }
        })
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let id = args::trimmed(&args, "id");
            let path = args::trimmed(&args, "path").or_else(|| args::trimmed(&args, "name"));
            if id.is_none() && path.is_none() {
                return AiToolResult::err("Please provide either 'id' or 'path' of the note.");
            }

            let book = match store::read_book(ctx.app) {
                Ok(b) => b,
                Err(err) => return AiToolResult::err(err),
            };

            match find_note(&book, id.as_deref(), path.as_deref()) {
                NoteMatch::One(idx, resolved_path) => {
                    let entry = &book.nodes[idx];
                    let content = entry_markdown(entry).unwrap_or("");
                    let body = if content.is_empty() {
                        "(empty note)"
                    } else {
                        content
                    };
                    AiToolResult::ok(format!(
                        "Note: {}\nPath: {resolved_path}\nID: {}\n\n{body}",
                        entry.name, entry.id
                    ))
                }
                NoteMatch::None => AiToolResult::err(
                    "Note not found. Call notebook_list to inspect available notes.",
                ),
                NoteMatch::Ambiguous(candidates) => {
                    let list = candidates
                        .into_iter()
                        .map(|(cid, cpath)| format!("- {cpath} (id: {cid})"))
                        .collect::<Vec<_>>()
                        .join("\n");
                    AiToolResult::err(format!(
                        "Multiple notes matched. Please specify 'id' or a full 'path':\n{list}"
                    ))
                }
            }
        })
    }
}

pub(crate) struct NotebookSaveTool;

impl AiTool for NotebookSaveTool {
    fn name(&self) -> &'static str {
        "notebook_save"
    }

    fn description(&self) -> &'static str {
        "Create a new Markdown note or update/append an existing note in the Open Tools Notebook. Missing folders in the target path are created automatically."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Existing note ID to update directly."
                },
                "path": {
                    "type": "string",
                    "description": "Logical note path (e.g. '工作/周报' or '学习笔记'). Alternative to folder + name."
                },
                "name": {
                    "type": "string",
                    "description": "Note title when creating a new note, or optional new title when updating by id."
                },
                "folder": {
                    "type": "string",
                    "description": "Target folder ID or nested folder path (e.g. '工作/2026'). Omit for root."
                },
                "content": {
                    "type": "string",
                    "description": "Markdown content to write or append."
                },
                "mode": {
                    "type": "string",
                    "enum": ["replace", "append"],
                    "description": "Write mode for an existing note: 'replace' (default) overwrites full content; 'append' appends to the end."
                },
                "overwrite": {
                    "type": "boolean",
                    "description": "When matching an existing note by path/name in replace mode, set true to overwrite it instead of returning an error (default false)."
                }
            },
            "required": ["content"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::Command
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let Some(content_val) = args.get("content").and_then(Value::as_str) else {
                return AiToolResult::err("Parameter 'content' is required.");
            };
            let content = content_val.to_string();
            if content.len() > MAX_NOTE_BYTES {
                return AiToolResult::err(format!(
                    "Note content exceeds maximum size ({MAX_NOTE_BYTES} bytes)."
                ));
            }

            let target_id = args::trimmed(&args, "id");
            let folder = args::trimmed(&args, "folder");
            let name = args::trimmed(&args, "name");
            let path = args::trimmed(&args, "path");
            let mode = args::trimmed(&args, "mode")
                .unwrap_or_else(|| "replace".to_string())
                .to_lowercase();
            if !matches!(mode.as_str(), "replace" | "append") {
                return AiToolResult::err("Parameter 'mode' must be 'replace' or 'append'.");
            }
            let overwrite = args::bool_or(&args, "overwrite", false);

            let outcome = store::mutate_book(ctx.app, |book| {
                // 1. 按 ID 更新已有笔记
                if let Some(ref id) = target_id {
                    let idx = book
                        .nodes
                        .iter()
                        .position(|entry| !entry.is_folder() && entry.id == *id)
                        .ok_or_else(|| format!("Note with id '{id}' not found."))?;
                    if let Some(new_name) = name
                        .as_deref()
                        .map(|n| strip_md_suffix(n.trim()).trim())
                        .filter(|n| !n.is_empty())
                    {
                        book.nodes[idx].name = new_name.to_string();
                    }
                    let final_len = match &mut book.nodes[idx].kind {
                        Kind::Note { body } => {
                            if mode == "append" && !body.markdown.is_empty() {
                                if !body.markdown.ends_with('\n') {
                                    body.markdown.push('\n');
                                }
                                body.markdown.push('\n');
                                body.markdown.push_str(&content);
                            } else {
                                body.markdown = content.clone();
                            }
                            if body.markdown.len() > MAX_NOTE_BYTES {
                                return Err(format!(
                                    "Updated note exceeds maximum size ({MAX_NOTE_BYTES} bytes)."
                                ));
                            }
                            body.markdown.chars().count()
                        }
                        Kind::Folder { .. } => {
                            return Err(format!("Entry '{id}' is a folder, not a note."));
                        }
                    };
                    let resolved = compute_node_paths(book)
                        .into_iter()
                        .find(|(i, _, _)| *i == idx)
                        .map(|(_, p, _)| p)
                        .unwrap_or_else(|| book.nodes[idx].name.clone());
                    let action = if mode == "append" { "Appended to" } else { "Updated" };
                    return Ok(format!(
                        "{action} note '{}' (path: {resolved}, id: {id}, {final_len} chars).",
                        book.nodes[idx].name
                    ));
                }

                // 2. 按路径或 folder + name 查找或创建笔记
                let (folder_spec, note_name) = parse_save_target(folder, name, path)?;
                let parent_id = match folder_spec.as_deref() {
                    Some(spec) => ensure_folder_path(book, spec)?,
                    None => None,
                };

                if let Some(idx) = book.nodes.iter().position(|entry| {
                    !entry.is_folder()
                        && entry.parent_id == parent_id
                        && names_match(&entry.name, &note_name)
                }) {
                    if mode == "replace" && !overwrite {
                        let existing_id = book.nodes[idx].id.clone();
                        let resolved = compute_node_paths(book)
                            .into_iter()
                            .find(|(i, _, _)| *i == idx)
                            .map(|(_, p, _)| p)
                            .unwrap_or_else(|| book.nodes[idx].name.clone());
                        return Err(format!(
                            "A note at '{resolved}' already exists (id: {existing_id}). Pass id='{existing_id}' to update it, set overwrite=true to replace it, or set mode='append' to append."
                        ));
                    }
                    let existing_id = book.nodes[idx].id.clone();
                    let final_len = match &mut book.nodes[idx].kind {
                        Kind::Note { body } => {
                            if mode == "append" && !body.markdown.is_empty() {
                                if !body.markdown.ends_with('\n') {
                                    body.markdown.push('\n');
                                }
                                body.markdown.push('\n');
                                body.markdown.push_str(&content);
                            } else {
                                body.markdown = content.clone();
                            }
                            if body.markdown.len() > MAX_NOTE_BYTES {
                                return Err(format!(
                                    "Updated note exceeds maximum size ({MAX_NOTE_BYTES} bytes)."
                                ));
                            }
                            body.markdown.chars().count()
                        }
                        Kind::Folder { .. } => unreachable!(),
                    };
                    let resolved = compute_node_paths(book)
                        .into_iter()
                        .find(|(i, _, _)| *i == idx)
                        .map(|(_, p, _)| p)
                        .unwrap_or_else(|| book.nodes[idx].name.clone());
                    let action = if mode == "append" { "Appended to" } else { "Updated" };
                    return Ok(format!(
                        "{action} note '{}' (path: {resolved}, id: {existing_id}, {final_len} chars).",
                        book.nodes[idx].name
                    ));
                }

                // 创建新笔记
                let mut id = generate_entry_id("note");
                while book.nodes.iter().any(|entry| entry.id == id) {
                    id = generate_entry_id("note");
                }
                let char_count = content.chars().count();
                book.nodes.push(Entry {
                    id: id.clone(),
                    parent_id,
                    name: note_name.clone(),
                    file_name: None,
                    kind: Kind::Note {
                        body: Text {
                            markdown: content.clone(),
                        },
                    },
                });
                if book.selected_id.is_none() {
                    book.selected_id = Some(id.clone());
                }
                let idx = book.nodes.len() - 1;
                let resolved = compute_node_paths(book)
                    .into_iter()
                    .find(|(i, _, _)| *i == idx)
                    .map(|(_, p, _)| p)
                    .unwrap_or_else(|| note_name.clone());
                Ok(format!(
                    "Created note '{note_name}' (path: {resolved}, id: {id}, {char_count} chars)."
                ))
            });

            match outcome {
                Ok(msg) => AiToolResult::ok(msg),
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}

pub(crate) struct NotebookDeleteTool;

impl AiTool for NotebookDeleteTool {
    fn name(&self) -> &'static str {
        "notebook_delete"
    }

    fn description(&self) -> &'static str {
        "Delete a single Markdown note from the Open Tools Notebook by its ID or logical path/name. Folders are not deleted by this tool."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Exact note ID (from notebook_list)."
                },
                "path": {
                    "type": "string",
                    "description": "Logical note path (e.g. '工作/周报') or bare note title."
                }
            }
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::Command
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let id = args::trimmed(&args, "id");
            let path = args::trimmed(&args, "path").or_else(|| args::trimmed(&args, "name"));
            if id.is_none() && path.is_none() {
                return AiToolResult::err("Please provide either 'id' or 'path' of the note to delete.");
            }

            let outcome = store::mutate_book(ctx.app, |book| {
                match find_note(book, id.as_deref(), path.as_deref()) {
                    NoteMatch::One(idx, resolved_path) => {
                        let removed = book.nodes.remove(idx);
                        if book.selected_id.as_deref() == Some(removed.id.as_str()) {
                            book.selected_id = book
                                .nodes
                                .iter()
                                .find(|entry| !entry.is_folder())
                                .map(|entry| entry.id.clone());
                        }
                        Ok(format!(
                            "Deleted note '{}' (path: {resolved_path}, id: {}).",
                            removed.name, removed.id
                        ))
                    }
                    NoteMatch::None => Err(
                        "Note not found. Call notebook_list to inspect available notes."
                            .to_string(),
                    ),
                    NoteMatch::Ambiguous(candidates) => {
                        let list = candidates
                            .into_iter()
                            .map(|(cid, cpath)| format!("- {cpath} (id: {cid})"))
                            .collect::<Vec<_>>()
                            .join("\n");
                        Err(format!(
                            "Multiple notes matched. Please specify 'id' or a full 'path':\n{list}"
                        ))
                    }
                }
            });

            match outcome {
                Ok(msg) => AiToolResult::ok(msg),
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}
