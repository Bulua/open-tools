//! AI 工作台本地持久化：
//! - `data/ai/config.dat`：模型提供商（含 API Key）与通用设置，Windows 上使用当前用户的 DPAPI 加密。
//! - `data/ai/conversations/index.json` 与 `<id>.json`：按会话独立保存历史消息，避免全量重写。

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[cfg(windows)]
use crate::core::dpapi::protect;
use crate::core::paths;

use super::paths::validate_conv_id;

const AI_DIR: &str = "ai";
pub(super) const CONFIG_FILE: &str = "config.dat";
const CONVERSATIONS_DIR: &str = "conversations";
const INDEX_FILE: &str = "index.json";

static AI_IO: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationIndexEntry {
    pub(crate) id: String,
    pub(crate) title: String,
    #[serde(default)]
    pub(crate) provider_id: String,
    #[serde(default)]
    pub(crate) model_id: String,
    pub(crate) created_at: i64,
    pub(crate) updated_at: i64,
    #[serde(default)]
    pub(crate) message_count: usize,
}

fn atomic_write(path: &Path, bytes: &[u8], label: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Missing directory for {label}."))?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create directory for {label}: {error}"))?;
    let result = (|| -> std::io::Result<()> {
        let mut file = tempfile::NamedTempFile::new_in(parent)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.as_file()
                .set_permissions(std::fs::Permissions::from_mode(0o600))?;
        }
        file.write_all(bytes)?;
        file.as_file().sync_all()?;
        file.persist(path)?;
        Ok(())
    })();
    result.map_err(|error| format!("Could not save {label}: {error}"))
}

pub(super) fn read_config_from(dir: &Path) -> Result<Option<String>, String> {
    let path = dir.join(CONFIG_FILE);
    let data = match std::fs::read(&path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not read AI config: {error}")),
    };
    #[cfg(windows)]
    let data = protect(&data, false)?;
    let text = String::from_utf8(data)
        .map_err(|error| format!("Could not decode AI config as UTF-8: {error}"))?;
    serde_json::from_str::<Value>(&text)
        .map_err(|error| format!("Could not parse AI config JSON: {error}"))?;
    Ok(Some(text))
}

pub(super) fn write_config_to(dir: &Path, data: &str) -> Result<(), String> {
    serde_json::from_str::<Value>(data)
        .map_err(|error| format!("Invalid AI config JSON: {error}"))?;
    let bytes = data.as_bytes();
    // 先加密再落盘，避免在磁盘上留下包含 API Key 的明文临时文件。
    #[cfg(windows)]
    let bytes = protect(bytes, true)?;
    #[cfg(not(windows))]
    let bytes = bytes.to_vec();
    atomic_write(&dir.join(CONFIG_FILE), &bytes, "AI config")
}

pub(super) fn conversations_dir(dir: &Path) -> PathBuf {
    dir.join(CONVERSATIONS_DIR)
}

pub(super) fn read_index(conv_dir: &Path) -> Result<Vec<ConversationIndexEntry>, String> {
    let path = conv_dir.join(INDEX_FILE);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Could not read AI conversation index: {error}")),
    };
    let mut list: Vec<ConversationIndexEntry> = serde_json::from_str(&text)
        .map_err(|error| format!("Could not parse AI conversation index: {error}"))?;
    list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(list)
}

fn write_index(conv_dir: &Path, entries: &[ConversationIndexEntry]) -> Result<(), String> {
    let data = serde_json::to_vec(entries)
        .map_err(|error| format!("Could not encode AI conversation index: {error}"))?;
    atomic_write(&conv_dir.join(INDEX_FILE), &data, "AI conversation index")
}

pub(super) fn read_conversation_from(dir: &Path, id: &str) -> Result<Option<String>, String> {
    validate_conv_id(id)?;
    let path = conversations_dir(dir).join(format!("{id}.json"));
    match std::fs::read_to_string(&path) {
        Ok(data) => Ok(Some(data)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read AI conversation: {error}")),
    }
}

pub(super) fn save_conversation_to(
    dir: &Path,
    summary: ConversationIndexEntry,
    data: &str,
) -> Result<Vec<ConversationIndexEntry>, String> {
    validate_conv_id(&summary.id)?;
    serde_json::from_str::<Value>(data)
        .map_err(|error| format!("Invalid AI conversation JSON: {error}"))?;
    let conv_dir = conversations_dir(dir);
    let conv_path = conv_dir.join(format!("{}.json", summary.id));
    atomic_write(&conv_path, data.as_bytes(), "AI conversation")?;

    let mut index = read_index(&conv_dir)?;
    if let Some(existing) = index.iter_mut().find(|item| item.id == summary.id) {
        *existing = summary;
    } else {
        index.push(summary);
    }
    index.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    write_index(&conv_dir, &index)?;
    Ok(index)
}

pub(super) fn delete_conversation_from(
    dir: &Path,
    id: &str,
) -> Result<Vec<ConversationIndexEntry>, String> {
    validate_conv_id(id)?;
    let conv_dir = conversations_dir(dir);
    let conv_path = conv_dir.join(format!("{id}.json"));
    match std::fs::remove_file(&conv_path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Could not delete AI conversation: {error}")),
    }
    let mut index = read_index(&conv_dir)?;
    index.retain(|item| item.id != id);
    write_index(&conv_dir, &index)?;
    Ok(index)
}

pub(super) async fn ai_read_config_impl(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = paths::sub_dir(&app, AI_DIR)?;
        let _guard = AI_IO.lock().map_err(|e| e.to_string())?;
        read_config_from(&dir)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) async fn ai_save_config_impl(app: tauri::AppHandle, data: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = paths::sub_dir(&app, AI_DIR)?;
        let _guard = AI_IO.lock().map_err(|e| e.to_string())?;
        write_config_to(&dir, &data)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) async fn ai_list_conversations_impl(
    app: tauri::AppHandle,
) -> Result<Vec<ConversationIndexEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = paths::sub_dir(&app, AI_DIR)?;
        let _guard = AI_IO.lock().map_err(|e| e.to_string())?;
        read_index(&conversations_dir(&dir))
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) async fn ai_read_conversation_impl(
    app: tauri::AppHandle,
    id: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = paths::sub_dir(&app, AI_DIR)?;
        let _guard = AI_IO.lock().map_err(|e| e.to_string())?;
        read_conversation_from(&dir, &id)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) async fn ai_save_conversation_impl(
    app: tauri::AppHandle,
    summary: ConversationIndexEntry,
    data: String,
) -> Result<Vec<ConversationIndexEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = paths::sub_dir(&app, AI_DIR)?;
        let _guard = AI_IO.lock().map_err(|e| e.to_string())?;
        save_conversation_to(&dir, summary, &data)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(super) async fn ai_delete_conversation_impl(
    app: tauri::AppHandle,
    id: String,
) -> Result<Vec<ConversationIndexEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = paths::sub_dir(&app, AI_DIR)?;
        let _guard = AI_IO.lock().map_err(|e| e.to_string())?;
        delete_conversation_from(&dir, &id)
    })
    .await
    .map_err(|error| error.to_string())?
}
