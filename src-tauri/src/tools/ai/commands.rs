//! AI 模块所有 Tauri IPC 命令入口（细粒度 SQLite 持久化、工作区与预览、后端多轮对话引擎与模型列表）。

use std::io::Cursor;

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{GenericImageView, ImageFormat};
use serde::Serialize;
use specta::Type;
use tauri::{
    ipc::{Channel, Request},
    AppHandle, State,
};

use crate::core::db::Database;
use crate::core::error::{AppError, AppResult};
use crate::tools::network::mcp_inspector::commands::McpSessions;

use super::attachments::{save_attachment_from_request, SavedAttachment};
use super::engine::{
    run_chat_turn, AiChatEvent, AiChatRunRequest, AiChatRunResult, AiChatState, ExecutionPolicy,
    ToolApprovalDecision,
};
use super::fs_tools::{read_file_impl, ReadFileResult};
use super::paths::{ensure_conversation_workspace_dir, resolve_target_path};
use super::providers::{fetch_models, EndpointConfig, RemoteModelInfo, ThinkingEffort};
use super::registry::AiToolRegistry;
use super::shell::AiCommandState;
use super::store::{
    self, AiConversationDetail, AiConversationMetaUpdate, AiConversationUpsertInput, AiFolderDto,
    AiInitialState, AiMessageDto, AiModelUpsertInput, AiModelView, ConversationIndexEntry,
};

// ---------- 初始化与细粒度配置持久化（SQLite） ----------

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_load_state(db: State<'_, Database>) -> AppResult<AiInitialState> {
    store::ai_load_state_impl(db.inner()).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_upsert_model(
    db: State<'_, Database>,
    input: AiModelUpsertInput,
) -> AppResult<Vec<AiModelView>> {
    store::ai_upsert_model_impl(db.inner(), input).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_delete_model(
    db: State<'_, Database>,
    id: String,
) -> AppResult<Vec<AiModelView>> {
    store::ai_delete_model_impl(db.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_set_default_model(
    db: State<'_, Database>,
    id: Option<String>,
) -> AppResult<Vec<AiModelView>> {
    store::ai_set_default_model_impl(db.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_set_model_enabled(
    db: State<'_, Database>,
    id: String,
    enabled: bool,
) -> AppResult<Vec<AiModelView>> {
    store::ai_set_model_enabled_impl(db.inner(), id, enabled).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_set_model_thinking_effort(
    db: State<'_, Database>,
    id: String,
    effort: ThinkingEffort,
) -> AppResult<()> {
    store::ai_set_model_thinking_effort_impl(db.inner(), id, effort).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_set_enabled_mcp_ids(
    db: State<'_, Database>,
    ids: Vec<String>,
) -> AppResult<()> {
    store::ai_set_enabled_mcp_ids_impl(db.inner(), ids).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_upsert_folder(
    db: State<'_, Database>,
    folder: AiFolderDto,
) -> AppResult<()> {
    store::ai_upsert_folder_impl(db.inner(), folder).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_delete_folder(db: State<'_, Database>, id: String) -> AppResult<()> {
    store::ai_delete_folder_impl(db.inner(), id).await
}

// ---------- 细粒度会话与消息持久化（SQLite） ----------

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_read_conversation(
    db: State<'_, Database>,
    id: String,
) -> AppResult<Option<AiConversationDetail>> {
    store::ai_read_conversation_impl(db.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_upsert_conversation(
    db: State<'_, Database>,
    input: AiConversationUpsertInput,
) -> AppResult<Vec<ConversationIndexEntry>> {
    store::ai_upsert_conversation_impl(db.inner(), input).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_update_conversation_meta(
    db: State<'_, Database>,
    updates: Vec<AiConversationMetaUpdate>,
) -> AppResult<()> {
    store::ai_update_conversation_meta_impl(db.inner(), updates).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_delete_conversation(
    db: State<'_, Database>,
    id: String,
) -> AppResult<Vec<ConversationIndexEntry>> {
    store::ai_delete_conversation_impl(db.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_upsert_message(
    db: State<'_, Database>,
    conversation_id: String,
    message: AiMessageDto,
) -> AppResult<Vec<ConversationIndexEntry>> {
    store::ai_upsert_message_impl(db.inner(), conversation_id, message).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_delete_message(
    db: State<'_, Database>,
    conversation_id: String,
    message_id: String,
) -> AppResult<Vec<ConversationIndexEntry>> {
    store::ai_delete_message_impl(db.inner(), conversation_id, message_id).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_truncate_messages_from(
    db: State<'_, Database>,
    conversation_id: String,
    from_message_id: String,
    inclusive: bool,
) -> AppResult<Vec<ConversationIndexEntry>> {
    store::ai_truncate_messages_from_impl(db.inner(), conversation_id, from_message_id, inclusive)
        .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_clear_messages(
    db: State<'_, Database>,
    conversation_id: String,
) -> AppResult<Vec<ConversationIndexEntry>> {
    store::ai_clear_messages_impl(db.inner(), conversation_id).await
}

// ---------- 工作区、附件与本地文件预览 ----------

#[tauri::command]
#[specta::specta]
pub(crate) fn ai_workspace_dir(app: AppHandle, conversation_id: String) -> AppResult<String> {
    ensure_conversation_workspace_dir(&app, &conversation_id).map_err(AppError::from)
}

#[tauri::command]
pub(crate) fn ai_save_attachment(request: Request<'_>) -> AppResult<SavedAttachment> {
    save_attachment_from_request(request).map_err(AppError::from)
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadImageResult {
    pub(crate) path: String,
    pub(crate) mime_type: String,
    /// 可直接用于 `<img>` 展示的 Data URL（TIFF 等浏览器不支持的格式会自动转为 PNG 预览）
    pub(crate) data_url: String,
    /// 原始文件字节的 Base64（用于下载原文件，留空时直接复用 `data_url`）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) raw_base64: Option<String>,
    #[specta(type = f64)]
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
#[specta::specta]
pub(crate) async fn ai_tool_read_image(
    workspace_dir: String,
    path: String,
) -> AppResult<ReadImageResult> {
    if path.trim().is_empty() {
        return Err(AppError::invalid_input("Image path is required."));
    }
    let (_root, target, _outside) = resolve_target_path(&workspace_dir, Some(&path))?;
    tauri::async_runtime::spawn_blocking(move || {
        let meta = std::fs::metadata(&target).map_err(|err| {
            AppError::io(format!("Could not access image {}: {err}", target.display()))
        })?;
        if meta.is_dir() {
            return Err(AppError::invalid_input(format!(
                "Path is a directory, not an image: {}",
                target.display()
            )));
        }
        if meta.len() > MAX_PREVIEW_IMAGE_BYTES {
            return Err(AppError::invalid_input(format!(
                "Image is too large to preview ({} bytes, limit {} bytes).",
                meta.len(),
                MAX_PREVIEW_IMAGE_BYTES
            )));
        }
        let bytes = std::fs::read(&target).map_err(|err| {
            AppError::io(format!("Could not read image {}: {err}", target.display()))
        })?;
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
            _ => mime_for_image_ext(&ext).ok_or_else(|| {
                AppError::invalid_input(format!("Unsupported image file: {}", target.display()))
            })?,
        };

        let dims = image::image_dimensions(&target).ok();
        let (width, height) = match dims {
            Some((w, h)) => (Some(w), Some(h)),
            None => (None, None),
        };

        // 浏览器无法直接渲染 TIFF，转成 PNG 供预览并保留原始字节供下载
        let (data_url, raw_base64) = if mime == "image/tiff" {
            let decoded = image::load_from_memory_with_format(&bytes, ImageFormat::Tiff)
                .map_err(|e| AppError::internal(format!("Failed to decode TIFF image: {e}")))?;
            let (dw, dh) = decoded.dimensions();
            let mut png = Vec::new();
            decoded
                .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
                .map_err(|e| AppError::internal(format!("Failed to render TIFF preview: {e}")))?;
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
    .map_err(|e| AppError::internal(format!("Failed to load image preview: {e}")))?
}

#[tauri::command]
#[specta::specta]
pub(crate) fn ai_tool_read_file(
    workspace_dir: String,
    path: String,
    start_line: Option<u32>,
    end_line: Option<u32>,
) -> AppResult<ReadFileResult> {
    read_file_impl(
        &workspace_dir,
        &path,
        start_line.map(|n| n as usize),
        end_line.map(|n| n as usize),
    )
    .map_err(AppError::from)
}

// ---------- 后端大模型对话引擎、审批与模型列表 ----------

#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_chat_run(
    app: AppHandle,
    db: State<'_, Database>,
    registry: State<'_, AiToolRegistry>,
    command_state: State<'_, AiCommandState>,
    mcp_sessions: State<'_, McpSessions>,
    chat_state: State<'_, AiChatState>,
    request: AiChatRunRequest,
    on_event: Channel<AiChatEvent>,
) -> AppResult<AiChatRunResult> {
    run_chat_turn(
        &app,
        db.inner(),
        registry.inner(),
        command_state.inner(),
        mcp_sessions.inner(),
        chat_state.inner(),
        request,
        on_event,
    )
    .await
    .map_err(AppError::from)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn ai_chat_approve(
    chat_state: State<'_, AiChatState>,
    conversation_id: String,
    decision: ToolApprovalDecision,
) -> AppResult<bool> {
    Ok(chat_state.resolve_approval(&conversation_id, decision))
}

#[tauri::command]
#[specta::specta]
pub(crate) fn ai_chat_cancel(
    chat_state: State<'_, AiChatState>,
    command_state: State<'_, AiCommandState>,
    conversation_id: String,
) -> AppResult<bool> {
    Ok(chat_state.cancel(&conversation_id, command_state.inner()))
}

#[tauri::command]
#[specta::specta]
pub(crate) fn ai_chat_set_policy(
    chat_state: State<'_, AiChatState>,
    conversation_id: String,
    policy: ExecutionPolicy,
) -> AppResult<()> {
    chat_state.set_policy(&conversation_id, policy);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) fn ai_chat_clear_session(
    chat_state: State<'_, AiChatState>,
    conversation_id: String,
) -> AppResult<()> {
    chat_state.clear_session(&conversation_id);
    Ok(())
}

/// 拉取远端模型列表：编辑已有模型且未重新输入 Key 时，传入 `model_config_id` 由后端直接从 SQLite 解密使用。
#[tauri::command]
#[specta::specta]
pub(crate) async fn ai_fetch_models(
    db: State<'_, Database>,
    mut endpoint: EndpointConfig,
    model_config_id: Option<String>,
) -> AppResult<Vec<RemoteModelInfo>> {
    if endpoint.api_key.trim().is_empty() {
        if let Some(id) = model_config_id.as_deref().filter(|s| !s.trim().is_empty()) {
            if let Some(saved_key) = store::resolve_model_api_key(db.inner(), id).await? {
                endpoint.api_key = saved_key;
            }
        }
    }
    fetch_models(&endpoint).await.map_err(AppError::provider)
}

/// 导出 AI 模块的 Rust -> TypeScript 强类型契约绑定文件（`src/api/generated/ai.ts`）。
#[cfg(debug_assertions)]
pub(crate) fn export_ai_bindings() -> Result<(), String> {
    use specta_typescript::Typescript;
    use tauri_specta::{collect_commands, Builder};

    let builder = Builder::<tauri::Wry>::new().commands(collect_commands![
        ai_load_state,
        ai_upsert_model,
        ai_delete_model,
        ai_set_default_model,
        ai_set_model_enabled,
        ai_set_model_thinking_effort,
        ai_set_enabled_mcp_ids,
        ai_upsert_folder,
        ai_delete_folder,
        ai_read_conversation,
        ai_upsert_conversation,
        ai_update_conversation_meta,
        ai_delete_conversation,
        ai_upsert_message,
        ai_delete_message,
        ai_truncate_messages_from,
        ai_clear_messages,
        ai_workspace_dir,
        ai_tool_read_image,
        ai_tool_read_file,
        ai_chat_run,
        ai_chat_approve,
        ai_chat_cancel,
        ai_chat_set_policy,
        ai_chat_clear_session,
        ai_fetch_models,
    ]);

    let out_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../src/api/generated/ai.ts");
    if let Some(parent) = out_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    builder
        .export(Typescript::default(), &out_path)
        .map_err(|err| format!("Failed to export AI specta bindings: {err}"))
}
