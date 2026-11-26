//! AI 模块所有 Tauri IPC 命令入口（持久化、系统提示词上下文、工具统一执行与工作区辅助）。

use std::io::Cursor;

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{GenericImageView, ImageFormat};
use serde::Serialize;
use serde_json::Value;
use tauri::{ipc::Request, AppHandle, State};

use super::attachments::{save_attachment_from_request, SavedAttachment};

use super::fs_tools::{
    edit_file_impl, list_dir_impl, read_file_impl, write_file_impl, EditFileResult, ListDirResult,
    ReadFileResult, WriteFileResult,
};
use super::paths::{ensure_conversation_workspace_dir, resolve_target_path};
use super::prompt::build_system_prompt;
use super::registry::{AiToolContext, AiToolDefinition, AiToolRegistry, AiToolResult};
use super::shell::{run_command_impl, AiCommandState, RunCommandResult};
use super::store::{self, ConversationIndexEntry};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PathCheckResult {
    pub(crate) resolved_path: String,
    pub(crate) outside_workspace: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuiltinAiContext {
    pub(crate) workspace_dir: String,
    pub(crate) system_prompt: String,
    pub(crate) tools: Vec<AiToolDefinition>,
}

// ---------- 配置与会话持久化 ----------

#[tauri::command]
pub(crate) async fn ai_read_config(app: AppHandle) -> Result<Option<String>, String> {
    store::ai_read_config_impl(app).await
}

#[tauri::command]
pub(crate) async fn ai_save_config(app: AppHandle, data: String) -> Result<(), String> {
    store::ai_save_config_impl(app, data).await
}

#[tauri::command]
pub(crate) async fn ai_list_conversations(
    app: AppHandle,
) -> Result<Vec<ConversationIndexEntry>, String> {
    store::ai_list_conversations_impl(app).await
}

#[tauri::command]
pub(crate) async fn ai_read_conversation(
    app: AppHandle,
    id: String,
) -> Result<Option<String>, String> {
    store::ai_read_conversation_impl(app, id).await
}

#[tauri::command]
pub(crate) async fn ai_save_conversation(
    app: AppHandle,
    summary: ConversationIndexEntry,
    data: String,
) -> Result<Vec<ConversationIndexEntry>, String> {
    store::ai_save_conversation_impl(app, summary, data).await
}

#[tauri::command]
pub(crate) async fn ai_delete_conversation(
    app: AppHandle,
    id: String,
) -> Result<Vec<ConversationIndexEntry>, String> {
    store::ai_delete_conversation_impl(app, id).await
}

// ---------- 系统提示词、注册表与统一工具执行 ----------

#[tauri::command]
pub(crate) fn ai_workspace_dir(app: AppHandle, conversation_id: String) -> Result<String, String> {
    ensure_conversation_workspace_dir(&app, &conversation_id)
}

#[tauri::command]
pub(crate) fn ai_save_attachment(request: Request<'_>) -> Result<SavedAttachment, String> {
    save_attachment_from_request(request)
}

#[tauri::command]
pub(crate) fn ai_builtin_context(
    app: AppHandle,
    registry: State<'_, AiToolRegistry>,
    conversation_id: String,
    custom_workspace_dir: Option<String>,
) -> Result<BuiltinAiContext, String> {
    let workspace_dir = match custom_workspace_dir
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(dir) => dir.to_string(),
        None => ensure_conversation_workspace_dir(&app, &conversation_id)?,
    };
    let system_prompt = build_system_prompt(&workspace_dir);
    let tools = registry.definitions();
    Ok(BuiltinAiContext {
        workspace_dir,
        system_prompt,
        tools,
    })
}

#[tauri::command]
pub(crate) async fn ai_tool_execute(
    app: AppHandle,
    registry: State<'_, AiToolRegistry>,
    command_state: State<'_, AiCommandState>,
    run_id: String,
    workspace_dir: String,
    tool_name: String,
    arguments: Value,
) -> Result<AiToolResult, String> {
    let ctx = AiToolContext {
        app: &app,
        run_id: &run_id,
        workspace_dir: &workspace_dir,
        command_state: &command_state,
    };
    Ok(registry.execute(&tool_name, arguments, &ctx).await)
}

// ---------- 细粒度工具命令（保留兼容与直调场景） ----------

#[tauri::command]
pub(crate) fn ai_tool_check_path(
    workspace_dir: String,
    path: String,
) -> Result<PathCheckResult, String> {
    if path.trim().is_empty() {
        return Err("File path is required.".into());
    }
    let (_root, resolved, outside) = resolve_target_path(&workspace_dir, Some(&path))?;
    Ok(PathCheckResult {
        resolved_path: resolved.to_string_lossy().to_string(),
        outside_workspace: outside,
    })
}

#[tauri::command]
pub(crate) fn ai_tool_list_dir(
    workspace_dir: String,
    path: Option<String>,
    max_entries: Option<usize>,
) -> Result<ListDirResult, String> {
    list_dir_impl(&workspace_dir, path.as_deref(), max_entries)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadImageResult {
    pub(crate) path: String,
    pub(crate) mime_type: String,
    /// 可直接用于 `<img>` 展示的 Data URL（TIFF 等浏览器不支持的格式会自动转为 PNG 预览）
    pub(crate) data_url: String,
    /// 原始文件字节的 Base64（用于下载原文件，留空时直接复用 `data_url`）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) raw_base64: Option<String>,
    pub(crate) size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) height: Option<u32>,
}

const MAX_PREVIEW_IMAGE_BYTES: u64 = 24 * 1024 * 1024;

fn mime_for_image_ext(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "svg" => Some("image/svg+xml"),
        "avif" => Some("image/avif"),
        "tif" | "tiff" => Some("image/tiff"),
        _ => None,
    }
}

#[tauri::command]
pub(crate) async fn ai_tool_read_image(
    workspace_dir: String,
    path: String,
) -> Result<ReadImageResult, String> {
    if path.trim().is_empty() {
        return Err("Image path is required.".into());
    }
    let (_root, target, _outside) = resolve_target_path(&workspace_dir, Some(&path))?;
    tauri::async_runtime::spawn_blocking(move || {
        let meta = std::fs::metadata(&target)
            .map_err(|err| format!("Could not access image {}: {err}", target.display()))?;
        if meta.is_dir() {
            return Err(format!("Path is a directory, not an image: {}", target.display()));
        }
        if meta.len() > MAX_PREVIEW_IMAGE_BYTES {
            return Err(format!(
                "Image is too large to preview ({} bytes, limit {} bytes).",
                meta.len(),
                MAX_PREVIEW_IMAGE_BYTES
            ));
        }
        let bytes = std::fs::read(&target)
            .map_err(|err| format!("Could not read image {}: {err}", target.display()))?;
        let ext = target
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        let guessed = image::guess_format(&bytes).ok();
        let mime = match guessed {
            Some(ImageFormat::Png) => "image/png",
            Some(ImageFormat::Jpeg) => "image/jpeg",
            Some(ImageFormat::WebP) => "image/webp",
            Some(ImageFormat::Gif) => "image/gif",
            Some(ImageFormat::Bmp) => "image/bmp",
            Some(ImageFormat::Ico) => "image/x-icon",
            Some(ImageFormat::Tiff) => "image/tiff",
            _ => mime_for_image_ext(&ext)
                .ok_or_else(|| format!("Unsupported image file: {}", target.display()))?,
        };

        let dims = image::image_dimensions(&target).ok();
        let (width, height) = match dims {
            Some((w, h)) => (Some(w), Some(h)),
            None => (None, None),
        };

        // 浏览器无法直接渲染 TIFF，转成 PNG 供预览并保留原始字节供下载
        let (data_url, raw_base64) = if mime == "image/tiff" {
            let decoded = image::load_from_memory_with_format(&bytes, ImageFormat::Tiff)
                .map_err(|e| format!("Failed to decode TIFF image: {e}"))?;
            let (dw, dh) = decoded.dimensions();
            let mut png = Vec::new();
            decoded
                .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
                .map_err(|e| format!("Failed to render TIFF preview: {e}"))?;
            return Ok(ReadImageResult {
                path: target.to_string_lossy().to_string(),
                mime_type: mime.to_string(),
                data_url: format!("data:image/png;base64,{}", STANDARD.encode(&png)),
                raw_base64: Some(STANDARD.encode(&bytes)),
                size_bytes: bytes.len() as u64,
                width: Some(dw),
                height: Some(dh),
            });
        } else {
            (format!("data:{mime};base64,{}", STANDARD.encode(&bytes)), None)
        };

        Ok(ReadImageResult {
            path: target.to_string_lossy().to_string(),
            mime_type: mime.to_string(),
            data_url,
            raw_base64,
            size_bytes: bytes.len() as u64,
            width,
            height,
        })
    })
    .await
    .map_err(|e| format!("Failed to load image preview: {e}"))?
}

#[tauri::command]
pub(crate) fn ai_tool_read_file(
    workspace_dir: String,
    path: String,
    start_line: Option<usize>,
    end_line: Option<usize>,
) -> Result<ReadFileResult, String> {
    read_file_impl(&workspace_dir, &path, start_line, end_line)
}

#[tauri::command]
pub(crate) fn ai_tool_write_file(
    workspace_dir: String,
    path: String,
    content: String,
) -> Result<WriteFileResult, String> {
    write_file_impl(&workspace_dir, &path, &content)
}

#[tauri::command]
pub(crate) fn ai_tool_edit_file(
    workspace_dir: String,
    path: String,
    old_text: String,
    new_text: String,
    replace_all: Option<bool>,
) -> Result<EditFileResult, String> {
    edit_file_impl(
        &workspace_dir,
        &path,
        &old_text,
        &new_text,
        replace_all.unwrap_or(false),
    )
}

#[tauri::command]
pub(crate) async fn ai_tool_run_command(
    state: State<'_, AiCommandState>,
    run_id: String,
    workspace_dir: String,
    command: String,
    shell: Option<String>,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<RunCommandResult, String> {
    let cancel_rx = state.register(&run_id);
    let result = run_command_impl(
        cancel_rx,
        &workspace_dir,
        &command,
        shell.as_deref(),
        cwd.as_deref(),
        timeout_secs,
    )
    .await;
    state.unregister(&run_id);
    result
}

#[tauri::command]
pub(crate) fn ai_tool_cancel_command(
    state: State<'_, AiCommandState>,
    run_id: String,
) -> Result<bool, String> {
    Ok(state.cancel(&run_id))
}
