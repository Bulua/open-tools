//! AI 对话附件落盘管理：将用户上传的任意文件无损保存到 `<工作目录>/uploads/`，
//! 采用二进制 IPC 传输原始字节，避免大文件 Base64 序列化开销。

use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};

use crate::core::error::{AppError, AppResult};

use super::paths::canonical_or_lexical;

const UPLOADS_DIR: &str = "uploads";
const MAX_ATTACHMENT_BYTES: usize = 100 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedAttachment {
    pub(crate) path: String,
    pub(crate) file_name: String,
    #[specta(type = f64)]
    pub(crate) size_bytes: u64,
}

fn decode_b64_header(request: &Request<'_>, name: &str) -> AppResult<String> {
    let raw = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::invalid_input(format!("Missing required header '{name}'.")))?;
    let bytes = STANDARD
        .decode(raw.as_bytes())
        .map_err(|_| AppError::invalid_input(format!("Invalid base64 encoding in header '{name}'.")))?;
    String::from_utf8(bytes)
        .map_err(|_| AppError::invalid_input(format!("Header '{name}' is not valid UTF-8.")))
}

/// 清理文件名中的非法字符与 Windows 保留设备名，仅保留单层安全文件名。
fn sanitize_file_name(raw: &str) -> String {
    let leaf = raw.rsplit(['/', '\\']).next().unwrap_or("").trim();
    let cleaned: String = leaf
        .chars()
        .take(180)
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches([' ', '.']);
    if trimmed.is_empty() {
        return "attachment".to_string();
    }
    let stem_upper = trimmed
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end()
        .to_ascii_uppercase();
    let is_reserved = matches!(
        stem_upper.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|prefix| {
        stem_upper
            .strip_prefix(prefix)
            .is_some_and(|p| p.len() == 1 && p.as_bytes()[0].is_ascii_digit())
    });
    if is_reserved {
        format!("_{trimmed}")
    } else {
        trimmed.to_string()
    }
}

/// 若目标目录已存在同名文件，则按 `name (2).ext` 顺延编号，避免覆盖已有附件。
fn allocate_unique_path(dir: &Path, safe_name: &str) -> (PathBuf, String) {
    let direct = dir.join(safe_name);
    if !direct.exists() {
        return (direct, safe_name.to_string());
    }
    let (stem, ext) = match safe_name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() && !e.is_empty() => (s, Some(e)),
        _ => (safe_name, None),
    };
    for idx in 2_u32..10_000 {
        let candidate_name = match ext {
            Some(e) => format!("{stem} ({idx}).{e}"),
            None => format!("{stem} ({idx})"),
        };
        let candidate_path = dir.join(&candidate_name);
        if !candidate_path.exists() {
            return (candidate_path, candidate_name);
        }
    }
    let fallback = format!("{stem}_{}", std::process::id());
    (dir.join(&fallback), fallback)
}

pub(crate) fn save_attachment_from_request(request: Request<'_>) -> AppResult<SavedAttachment> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::invalid_input(
            "Expected raw binary attachment body.",
        ));
    };
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(AppError::invalid_input(format!(
            "Attachment exceeds maximum size ({} bytes, limit {} bytes).",
            bytes.len(),
            MAX_ATTACHMENT_BYTES
        )));
    }

    let workspace_dir = decode_b64_header(&request, "x-workspace-dir")?;
    if workspace_dir.trim().is_empty() {
        return Err(AppError::invalid_input("Workspace directory is required."));
    }
    let raw_name = decode_b64_header(&request, "x-file-name")?;
    let safe_name = sanitize_file_name(&raw_name);

    let uploads_dir = canonical_or_lexical(Path::new(workspace_dir.trim())).join(UPLOADS_DIR);
    std::fs::create_dir_all(&uploads_dir).map_err(|err| {
        AppError::io(format!(
            "Could not create uploads directory {}: {err}",
            uploads_dir.display()
        ))
    })?;

    let (target_path, final_name) = allocate_unique_path(&uploads_dir, &safe_name);
    std::fs::write(&target_path, bytes).map_err(|err| {
        AppError::io(format!(
            "Could not save attachment {}: {err}",
            target_path.display()
        ))
    })?;

    Ok(SavedAttachment {
        path: target_path.to_string_lossy().to_string(),
        file_name: final_name,
        size_bytes: bytes.len() as u64,
    })
}
