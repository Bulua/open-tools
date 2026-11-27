//! 文件类内置工具实现：`list_dir`、`read_file`、`write_file`、`edit_file`。

use serde::Serialize;
use serde_json::{json, Value};
use specta::Type;

use crate::core::process::decode_output;

use super::args;
use super::paths::resolve_target_path;
use super::registry::{AiTool, AiToolContext, AiToolFuture, AiToolResult, ToolApprovalPolicy};

const MAX_READ_BYTES: u64 = 4 * 1024 * 1024;
const MAX_WRITE_BYTES: usize = 2 * 1024 * 1024;
const DEFAULT_READ_LINES: usize = 400;
const MAX_READ_LINES: usize = 600;
const MAX_READ_OUTPUT_BYTES: usize = 64 * 1024;
const DEFAULT_LIST_ENTRIES: usize = 200;
const MAX_LIST_ENTRIES: usize = 500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirEntryInfo {
    pub(crate) name: String,
    pub(crate) kind: &'static str,
    pub(crate) size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListDirResult {
    pub(crate) path: String,
    pub(crate) entries: Vec<DirEntryInfo>,
    pub(crate) truncated: bool,
    pub(crate) total_count: usize,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadFileResult {
    pub(crate) path: String,
    pub(crate) content: String,
    #[specta(type = u32)]
    pub(crate) start_line: usize,
    #[specta(type = u32)]
    pub(crate) end_line: usize,
    #[specta(type = u32)]
    pub(crate) total_lines: usize,
    pub(crate) truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WriteFileResult {
    pub(crate) path: String,
    pub(crate) bytes: usize,
    pub(crate) line_count: usize,
    pub(crate) outside_workspace: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditFileResult {
    pub(crate) path: String,
    pub(crate) replacements: usize,
    pub(crate) content: String,
    pub(crate) line_count: usize,
    pub(crate) bytes: usize,
    pub(crate) outside_workspace: bool,
}

fn looks_binary(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(4096)];
    if sample.contains(&0) {
        return true;
    }
    let bad = sample
        .iter()
        .filter(|&&b| b < 9 || (b > 13 && b < 32))
        .count();
    !sample.is_empty() && bad * 10 > sample.len()
}

pub(crate) fn list_dir_impl(
    workspace_dir: &str,
    path: Option<&str>,
    max_entries: Option<usize>,
) -> Result<ListDirResult, String> {
    let (_root, target, _outside) = resolve_target_path(workspace_dir, path)?;
    if !target.exists() {
        return Err(format!("Directory does not exist: {}", target.display()));
    }
    if !target.is_dir() {
        return Err(format!("Path is not a directory: {}", target.display()));
    }

    let limit = max_entries
        .unwrap_or(DEFAULT_LIST_ENTRIES)
        .clamp(1, MAX_LIST_ENTRIES);
    let read_dir = std::fs::read_dir(&target)
        .map_err(|err| format!("Could not read directory {}: {err}", target.display()))?;

    let mut entries: Vec<DirEntryInfo> = Vec::new();
    for item in read_dir {
        let Ok(entry) = item else { continue };
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = if is_dir {
            0
        } else {
            meta.as_ref().map(|m| m.len()).unwrap_or(0)
        };
        entries.push(DirEntryInfo {
            name,
            kind: if is_dir { "dir" } else { "file" },
            size,
        });
    }

    entries.sort_by(|a, b| {
        let rank_a = if a.kind == "dir" { 0 } else { 1 };
        let rank_b = if b.kind == "dir" { 0 } else { 1 };
        rank_a
            .cmp(&rank_b)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    let total_count = entries.len();
    let truncated = total_count > limit;
    if truncated {
        entries.truncate(limit);
    }

    Ok(ListDirResult {
        path: target.to_string_lossy().to_string(),
        entries,
        truncated,
        total_count,
    })
}

pub(crate) fn read_file_impl(
    workspace_dir: &str,
    path: &str,
    start_line: Option<usize>,
    end_line: Option<usize>,
) -> Result<ReadFileResult, String> {
    if path.trim().is_empty() {
        return Err("File path is required.".into());
    }
    let (_root, target, _outside) = resolve_target_path(workspace_dir, Some(path))?;
    let meta = std::fs::metadata(&target)
        .map_err(|err| format!("Could not access file {}: {err}", target.display()))?;
    if meta.is_dir() {
        return Err(format!("Path is a directory, not a file: {}", target.display()));
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(format!(
            "File is too large to read directly ({} bytes, limit {} bytes).",
            meta.len(),
            MAX_READ_BYTES
        ));
    }

    let bytes = std::fs::read(&target)
        .map_err(|err| format!("Could not read file {}: {err}", target.display()))?;
    if looks_binary(&bytes) {
        return Err(format!(
            "File appears to be binary and cannot be read as text: {}",
            target.display()
        ));
    }

    let decoded = decode_output(&bytes);
    let lines: Vec<&str> = decoded.lines().collect();
    let total_lines = lines.len();
    if total_lines == 0 {
        return Ok(ReadFileResult {
            path: target.to_string_lossy().to_string(),
            content: String::new(),
            start_line: 1,
            end_line: 0,
            total_lines: 0,
            truncated: false,
        });
    }

    let start = start_line.unwrap_or(1).max(1);
    if start > total_lines {
        return Err(format!(
            "start_line ({start}) exceeds total line count ({total_lines})."
        ));
    }
    let requested_end = end_line
        .unwrap_or(start + DEFAULT_READ_LINES - 1)
        .max(start);
    let capped_end = requested_end
        .min(start + MAX_READ_LINES - 1)
        .min(total_lines);

    let mut out = String::new();
    let mut actual_end = start - 1;
    let mut truncated = capped_end < total_lines;

    for idx in (start - 1)..capped_end {
        let line_no = idx + 1;
        let formatted = format!("{line_no}: {}\n", lines[idx]);
        if !out.is_empty() && out.len() + formatted.len() > MAX_READ_OUTPUT_BYTES {
            truncated = true;
            break;
        }
        out.push_str(&formatted);
        actual_end = line_no;
    }

    Ok(ReadFileResult {
        path: target.to_string_lossy().to_string(),
        content: out,
        start_line: start,
        end_line: actual_end,
        total_lines,
        truncated,
    })
}

pub(crate) fn write_file_impl(
    workspace_dir: &str,
    path: &str,
    content: &str,
) -> Result<WriteFileResult, String> {
    if path.trim().is_empty() {
        return Err("File path is required.".into());
    }
    if content.len() > MAX_WRITE_BYTES {
        return Err(format!(
            "Content exceeds maximum write size ({} bytes).",
            MAX_WRITE_BYTES
        ));
    }
    let (_root, target, outside) = resolve_target_path(workspace_dir, Some(path))?;
    if target.is_dir() {
        return Err(format!("Path is a directory: {}", target.display()));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            format!(
                "Could not create parent directory {}: {err}",
                parent.display()
            )
        })?;
    }
    std::fs::write(&target, content.as_bytes())
        .map_err(|err| format!("Could not write file {}: {err}", target.display()))?;

    let line_count = if content.is_empty() {
        0
    } else {
        content.split('\n').count()
    };

    Ok(WriteFileResult {
        path: target.to_string_lossy().to_string(),
        bytes: content.len(),
        line_count,
        outside_workspace: outside,
    })
}

pub(crate) fn edit_file_impl(
    workspace_dir: &str,
    path: &str,
    old_text: &str,
    new_text: &str,
    replace_all: bool,
) -> Result<EditFileResult, String> {
    if path.trim().is_empty() {
        return Err("File path is required.".into());
    }
    if old_text.is_empty() {
        return Err("old_text must not be empty.".into());
    }
    let (_root, target, outside) = resolve_target_path(workspace_dir, Some(path))?;
    let meta = std::fs::metadata(&target)
        .map_err(|err| format!("Could not access file {}: {err}", target.display()))?;
    if meta.is_dir() {
        return Err(format!("Path is a directory: {}", target.display()));
    }
    if meta.len() > MAX_WRITE_BYTES as u64 {
        return Err(format!(
            "File is too large to edit directly ({} bytes).",
            meta.len()
        ));
    }

    let bytes = std::fs::read(&target)
        .map_err(|err| format!("Could not read file {}: {err}", target.display()))?;
    if looks_binary(&bytes) {
        return Err(format!("Cannot edit binary file: {}", target.display()));
    }
    let original = decode_output(&bytes);

    // 兼容 Windows 文件 CRLF 与模型传入 LF 的差异
    let (needle, replacement) = if !original.contains(old_text)
        && original.contains("\r\n")
        && !old_text.contains("\r\n")
    {
        let crlf_old = old_text.replace('\n', "\r\n");
        let crlf_new = new_text.replace("\r\n", "\n").replace('\n', "\r\n");
        (crlf_old, crlf_new)
    } else {
        (old_text.to_string(), new_text.to_string())
    };

    let matches = original.matches(&needle).count();
    if matches == 0 {
        return Err("Target old_text was not found in the file.".into());
    }
    if matches > 1 && !replace_all {
        return Err(format!(
            "Target old_text matched {matches} places; provide more surrounding context or set replace_all to true."
        ));
    }

    let updated = if replace_all {
        original.replace(&needle, &replacement)
    } else {
        original.replacen(&needle, &replacement, 1)
    };
    if updated.len() > MAX_WRITE_BYTES {
        return Err(format!(
            "Updated content exceeds maximum write size ({} bytes).",
            MAX_WRITE_BYTES
        ));
    }

    std::fs::write(&target, updated.as_bytes())
        .map_err(|err| format!("Could not write file {}: {err}", target.display()))?;

    let line_count = if updated.is_empty() {
        0
    } else {
        updated.split('\n').count()
    };

    Ok(EditFileResult {
        path: target.to_string_lossy().to_string(),
        replacements: if replace_all { matches } else { 1 },
        content: updated.clone(),
        line_count,
        bytes: updated.len(),
        outside_workspace: outside,
    })
}

pub(crate) struct ListDirTool;

impl AiTool for ListDirTool {
    fn name(&self) -> &'static str {
        "list_dir"
    }

    fn description(&self) -> &'static str {
        "List files and subdirectories in a directory. Relative paths are resolved from the current conversation workspace directory."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path (relative to workspace or absolute). Omit for workspace root."
                },
                "max_entries": {
                    "type": "integer",
                    "description": "Maximum number of entries to return (default 200, max 500)."
                }
            }
        })
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let path_val = args::str_or_empty(&args, "path");
            let path_opt = if path_val.trim().is_empty() {
                None
            } else {
                Some(path_val.as_str())
            };
            let max_entries = args::opt_usize(&args, "max_entries");
            match list_dir_impl(ctx.workspace_dir, path_opt, max_entries) {
                Ok(res) => {
                    let lines: Vec<String> = res
                        .entries
                        .iter()
                        .map(|entry| {
                            if entry.kind == "dir" {
                                format!("[dir]  {}/", entry.name)
                            } else {
                                format!("[file] {} ({} B)", entry.name, entry.size)
                            }
                        })
                        .collect();
                    let suffix = if res.truncated {
                        format!(", showing first {}", res.entries.len())
                    } else {
                        String::new()
                    };
                    let header = format!(
                        "Directory: {} ({} items{suffix})",
                        res.path, res.total_count
                    );
                    let text = if lines.is_empty() {
                        format!("{header}\n(empty)")
                    } else {
                        format!("{header}\n{}", lines.join("\n"))
                    };
                    AiToolResult::ok(text)
                }
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}

pub(crate) struct ReadFileTool;

impl AiTool for ReadFileTool {
    fn name(&self) -> &'static str {
        "read_file"
    }

    fn description(&self) -> &'static str {
        "Read a UTF-8/GBK text file with line numbers. Relative paths resolve from the current workspace directory."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path to read (relative to workspace or absolute)."
                },
                "start_line": {
                    "type": "integer",
                    "description": "1-based start line number (default 1)."
                },
                "end_line": {
                    "type": "integer",
                    "description": "1-based inclusive end line number (default start_line + 399)."
                }
            },
            "required": ["path"]
        })
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let path = args::str_or_empty(&args, "path");
            let start_line = args::opt_usize(&args, "start_line");
            let end_line = args::opt_usize(&args, "end_line");
            match read_file_impl(ctx.workspace_dir, &path, start_line, end_line) {
                Ok(res) => {
                    let range = if res.total_lines > 0 {
                        format!("lines {}-{} of {}", res.start_line, res.end_line, res.total_lines)
                    } else {
                        "empty file".to_string()
                    };
                    let trunc = if res.truncated { ", truncated" } else { "" };
                    let header = format!("File: {} ({range}{trunc})", res.path);
                    let text = if res.content.is_empty() {
                        header
                    } else {
                        format!("{header}\n{}", res.content)
                    };
                    AiToolResult::ok(text)
                }
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}

pub(crate) struct WriteFileTool;

impl AiTool for WriteFileTool {
    fn name(&self) -> &'static str {
        "write_file"
    }

    fn description(&self) -> &'static str {
        "Create or overwrite a UTF-8 text file, automatically creating parent directories. Relative paths write inside the current workspace directory."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Target file path (relative to workspace or absolute)."
                },
                "content": {
                    "type": "string",
                    "description": "Full text content to write to the file."
                }
            },
            "required": ["path", "content"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::ExternalWrite
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let path = args::str_or_empty(&args, "path");
            let content = args::str_or_empty(&args, "content");
            match write_file_impl(ctx.workspace_dir, &path, &content) {
                Ok(res) => AiToolResult::ok_with_file(
                    format!(
                        "Wrote {} bytes ({} lines) to {}",
                        res.bytes, res.line_count, res.path
                    ),
                    res.path,
                    content,
                ),
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}

pub(crate) struct EditFileTool;

impl AiTool for EditFileTool {
    fn name(&self) -> &'static str {
        "edit_file"
    }

    fn description(&self) -> &'static str {
        "Replace an exact snippet in an existing text file. By default old_text must match uniquely; set replace_all to true to replace all occurrences."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Target file path (relative to workspace or absolute)."
                },
                "old_text": {
                    "type": "string",
                    "description": "Exact existing text to replace."
                },
                "new_text": {
                    "type": "string",
                    "description": "Replacement text."
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "Replace all occurrences instead of requiring a unique match (default false)."
                }
            },
            "required": ["path", "old_text", "new_text"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::ExternalWrite
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let path = args::str_or_empty(&args, "path");
            let old_text = args::str_or_empty(&args, "old_text");
            let new_text = args::str_or_empty(&args, "new_text");
            let replace_all = args::bool_or(&args, "replace_all", false);
            match edit_file_impl(ctx.workspace_dir, &path, &old_text, &new_text, replace_all) {
                Ok(res) => {
                    let plural = if res.replacements == 1 { "" } else { "s" };
                    AiToolResult::ok_with_file(
                        format!(
                            "Updated {} ({} replacement{plural}, {} lines, {} bytes)",
                            res.path, res.replacements, res.line_count, res.bytes
                        ),
                        res.path,
                        res.content,
                    )
                }
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}
