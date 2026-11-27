//! AI 会话工作目录与路径边界解析：校验会话 ID、规范化路径并判断目标是否超出工作区。

use std::path::{Component, Path, PathBuf};

use tauri::AppHandle;

use crate::core::error::{AppError, AppResult};
use crate::core::paths as app_paths;

const AI_DIR: &str = "ai";
const WORKSPACES_DIR: &str = "workspaces";

pub(crate) fn validate_conv_id(id: &str) -> AppResult<()> {
    let valid = !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !valid {
        return Err(AppError::invalid_input("Invalid AI conversation ID."));
    }
    Ok(())
}

/// 去掉 Windows canonicalize 产生的 `\\?\` 前缀，保持路径可读
pub(crate) fn strip_verbatim_prefix(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let text = path.to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path
}

pub(crate) fn normalize_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::Prefix(p) => out.push(p.as_os_str()),
            Component::RootDir => out.push(comp.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                if matches!(out.components().next_back(), Some(Component::Normal(_))) {
                    out.pop();
                } else if !out.is_absolute() {
                    out.push(comp.as_os_str());
                }
            }
            Component::Normal(part) => out.push(part),
        }
    }
    out
}

/// 尽量规范化最长已存在祖先目录，并拼接尚未创建的后续路径段，避免符号链接或 `..` 误判
pub(crate) fn canonical_or_lexical(path: &Path) -> PathBuf {
    let lexical = normalize_lexical(path);
    if let Ok(canon) = std::fs::canonicalize(&lexical) {
        return strip_verbatim_prefix(canon);
    }
    let mut cursor = lexical.as_path();
    let mut tail: Vec<&std::ffi::OsStr> = Vec::new();
    while let Some(parent) = cursor.parent() {
        if let Some(name) = cursor.file_name() {
            tail.push(name);
        }
        if let Ok(canon) = std::fs::canonicalize(parent) {
            let mut result = strip_verbatim_prefix(canon);
            for part in tail.into_iter().rev() {
                result.push(part);
            }
            return normalize_lexical(&result);
        }
        if parent == cursor {
            break;
        }
        cursor = parent;
    }
    lexical
}

pub(crate) fn is_within(target: &Path, root: &Path) -> bool {
    #[cfg(windows)]
    {
        let mut target_iter = target.components();
        for root_comp in root.components() {
            let Some(target_comp) = target_iter.next() else {
                return false;
            };
            let r = root_comp.as_os_str().to_string_lossy().to_lowercase();
            let t = target_comp.as_os_str().to_string_lossy().to_lowercase();
            if r != t {
                return false;
            }
        }
        true
    }
    #[cfg(not(windows))]
    {
        target.starts_with(root)
    }
}

pub(crate) fn resolve_target_path(
    workspace_dir: &str,
    raw_path: Option<&str>,
) -> AppResult<(PathBuf, PathBuf, bool)> {
    let ws_trimmed = workspace_dir.trim();
    if ws_trimmed.is_empty() {
        return Err(AppError::invalid_input("Workspace directory is required."));
    }
    let ws_root = canonical_or_lexical(Path::new(ws_trimmed));
    let requested = raw_path.unwrap_or("").trim();
    let joined = if requested.is_empty() || requested == "." {
        ws_root.clone()
    } else {
        let candidate = Path::new(requested);
        if candidate.is_absolute() {
            candidate.to_path_buf()
        } else {
            ws_root.join(candidate)
        }
    };
    let resolved = canonical_or_lexical(&joined);
    let outside = !is_within(&resolved, &ws_root);
    Ok((ws_root, resolved, outside))
}

pub(crate) fn ensure_conversation_workspace_dir(
    app: &AppHandle,
    conversation_id: &str,
) -> AppResult<String> {
    validate_conv_id(conversation_id)?;
    let dir = app_paths::sub_dir(app, AI_DIR)
        .map_err(AppError::io)?
        .join(WORKSPACES_DIR)
        .join(conversation_id);
    std::fs::create_dir_all(&dir)
        .map_err(|err| AppError::io(format!("Could not create AI workspace directory: {err}")))?;
    Ok(canonical_or_lexical(&dir).to_string_lossy().to_string())
}
