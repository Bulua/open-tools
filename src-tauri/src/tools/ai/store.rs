//! AI 工作台细粒度 SQLite 持久化层（基于全应用统一基座 `core::db::Database`）。
//!
//! 特点：
//! - API Key 仅在 Rust 侧经 Windows DPAPI 加密存库与解密使用，前端只拿到脱敏的 `maskedApiKey`；
//! - 所有配置、文件夹、会话与消息均提供细粒度强类型 CRUD，不再整包 JSON 往返；
//! - 复用公共表 `folders`（`scope = 'ai'`）和 `app_settings`（`scope = 'ai'`，如 `enabledMcpIds`）。

use std::collections::{HashMap, HashSet};
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

use crate::core::db::{
    folders::{list_folders, FolderRecord},
    millis_to_datetime_conn, normalize_datetime, now_datetime,
    settings::{get_setting_json, set_setting_json},
    Database, Migration,
};
#[cfg(windows)]
use crate::core::dpapi::protect;
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

use super::paths::validate_conv_id;
use super::providers::{ApiProtocol, EndpointConfig, ThinkingEffort};
use super::registry::AiBuiltinToolInfo;

const AI_SCOPE: &str = "ai";
const SETTING_ENABLED_MCP_IDS: &str = "enabledMcpIds";
const SETTING_DISABLED_BUILTIN_TOOLS: &str = "disabledBuiltinTools";
const SETTING_LEGACY_MIGRATED: &str = "legacyMigrated";

const LEGACY_AI_DIR: &str = "ai";
const LEGACY_CONFIG_FILE: &str = "config.dat";
const LEGACY_CONVERSATIONS_DIR: &str = "conversations";
const LEGACY_INDEX_FILE: &str = "index.json";

pub(crate) const AI_MIGRATIONS: &[Migration] = &[
    Migration {
        id: "ai_001_init",
        sql: r#"
            CREATE TABLE IF NOT EXISTS ai_models (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                provider_name TEXT,
                name TEXT NOT NULL DEFAULT '',
                protocol TEXT NOT NULL DEFAULT 'openai',
                base_url TEXT NOT NULL DEFAULT '',
                api_key_enc BLOB NOT NULL,
                model_id TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                max_tokens INTEGER,
                thinking_support TEXT,
                thinking_effort TEXT,
                is_default INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_ai_models_order
                ON ai_models(sort_order ASC, created_at ASC);

            CREATE TABLE IF NOT EXISTS ai_conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                model_config_id TEXT,
                provider_id TEXT NOT NULL DEFAULT '',
                model_id TEXT NOT NULL DEFAULT '',
                workspace_dir TEXT,
                execution_policy TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
                sort_order INTEGER,
                message_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated
                ON ai_conversations(updated_at DESC);

            CREATE TABLE IF NOT EXISTS ai_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
                seq INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                reasoning TEXT,
                attachments_json TEXT,
                tool_calls_json TEXT,
                parts_json TEXT,
                model_config_id TEXT,
                provider_name TEXT,
                model_id TEXT,
                model_name TEXT,
                duration_ms INTEGER,
                error TEXT,
                aborted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_ai_messages_conv_seq
                ON ai_messages(conversation_id, seq ASC);
        "#,
    },
    Migration {
        id: "ai_002_datetime_format",
        sql: r#"
            UPDATE ai_models
            SET created_at = datetime(created_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(created_at) IN ('integer', 'real');

            UPDATE ai_models
            SET updated_at = datetime(updated_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(updated_at) IN ('integer', 'real');

            UPDATE ai_conversations
            SET created_at = datetime(created_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(created_at) IN ('integer', 'real');

            UPDATE ai_conversations
            SET updated_at = datetime(updated_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(updated_at) IN ('integer', 'real');

            UPDATE ai_messages
            SET created_at = datetime(created_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(created_at) IN ('integer', 'real');
        "#,
    },
];

// ---------- 前后端强类型 DTO ----------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationIndexEntry {
    pub(crate) id: String,
    pub(crate) title: String,
    #[serde(default)]
    pub(crate) provider_id: String,
    #[serde(default)]
    pub(crate) model_id: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    #[serde(default)]
    #[specta(type = u32)]
    pub(crate) message_count: usize,
}

/// 返回给前端展示的模型配置视图（不含明文 API Key，仅提供脱敏展示与是否已配置标记）。
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiModelView {
    pub(crate) id: String,
    pub(crate) provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) provider_name: Option<String>,
    pub(crate) name: String,
    pub(crate) protocol: ApiProtocol,
    pub(crate) base_url: String,
    pub(crate) has_api_key: bool,
    pub(crate) masked_api_key: String,
    pub(crate) model_id: String,
    pub(crate) enabled: bool,
    pub(crate) is_default: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) thinking_support: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) thinking_effort: Option<ThinkingEffort>,
}

/// 后端内部使用的完整模型凭证（含已解密的 API Key，仅供 Rust 发起 SDK 请求）。
#[derive(Debug, Clone)]
pub(crate) struct ResolvedModelCredentials {
    pub(crate) endpoint: EndpointConfig,
    pub(crate) model_id: String,
    pub(crate) max_tokens: Option<u32>,
}

/// 前端新增/编辑模型时的入参：
/// - `api_key: None`：编辑时保持数据库现有密钥不变；
/// - `api_key: Some("")`：清空密钥；
/// - `api_key: Some(key)`：使用 DPAPI 加密后覆盖写入。
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiModelUpsertInput {
    pub(crate) id: String,
    pub(crate) provider_id: String,
    #[serde(default)]
    pub(crate) provider_name: Option<String>,
    #[serde(default)]
    pub(crate) name: String,
    pub(crate) protocol: ApiProtocol,
    pub(crate) base_url: String,
    #[serde(default)]
    pub(crate) api_key: Option<String>,
    pub(crate) model_id: String,
    #[serde(default = "default_true")]
    pub(crate) enabled: bool,
    #[serde(default)]
    pub(crate) max_tokens: Option<u32>,
    #[serde(default)]
    pub(crate) thinking_support: Option<String>,
    #[serde(default)]
    pub(crate) thinking_effort: Option<ThinkingEffort>,
    #[serde(default)]
    pub(crate) is_default: Option<bool>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiFolderDto {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) pinned: bool,
    pub(crate) collapsed: bool,
    #[serde(default)]
    pub(crate) created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiConversationMetaDto {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) pinned: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) folder_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[specta(type = Option<i32>)]
    pub(crate) order: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiConversationMetaUpdate {
    pub(crate) conversation_id: String,
    pub(crate) pinned: bool,
    #[serde(default)]
    pub(crate) folder_id: Option<String>,
    #[serde(default)]
    #[specta(type = Option<i32>)]
    pub(crate) order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiInitialState {
    pub(crate) models: Vec<AiModelView>,
    pub(crate) enabled_mcp_ids: Vec<String>,
    pub(crate) disabled_builtin_tools: Vec<String>,
    pub(crate) builtin_tools: Vec<AiBuiltinToolInfo>,
    pub(crate) folders: Vec<AiFolderDto>,
    pub(crate) conversation_meta: HashMap<String, AiConversationMetaDto>,
    pub(crate) conversations: Vec<ConversationIndexEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiMessageDto {
    pub(crate) id: String,
    pub(crate) role: String,
    #[serde(default)]
    pub(crate) content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reasoning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) attachments_json: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tool_calls_json: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) parts_json: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) model_config_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) provider_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) model_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[specta(type = Option<f64>)]
    pub(crate) duration_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
    #[serde(default)]
    pub(crate) aborted: bool,
    #[serde(default)]
    pub(crate) created_at: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiConversationDetail {
    pub(crate) id: String,
    pub(crate) title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) model_config_id: Option<String>,
    pub(crate) provider_id: String,
    pub(crate) model_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) workspace_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) execution_policy: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    #[specta(type = u32)]
    pub(crate) message_count: usize,
    pub(crate) messages: Vec<AiMessageDto>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiConversationUpsertInput {
    pub(crate) id: String,
    pub(crate) title: String,
    #[serde(default)]
    pub(crate) model_config_id: Option<String>,
    #[serde(default)]
    pub(crate) provider_id: String,
    #[serde(default)]
    pub(crate) model_id: String,
    #[serde(default)]
    pub(crate) workspace_dir: Option<String>,
    #[serde(default)]
    pub(crate) execution_policy: Option<String>,
    #[serde(default)]
    pub(crate) created_at: String,
    #[serde(default)]
    pub(crate) updated_at: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiConversationUpsertResult {
    pub(crate) id: String,
    pub(crate) conversations: Vec<ConversationIndexEntry>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiMessageUpsertResult {
    pub(crate) id: String,
    pub(crate) conversations: Vec<ConversationIndexEntry>,
}

// ---------- 加密与脱敏辅助 ----------

fn encrypt_secret(plain: &str) -> Vec<u8> {
    if plain.is_empty() {
        return Vec::new();
    }
    #[cfg(windows)]
    {
        protect(plain.as_bytes(), true).unwrap_or_else(|_| plain.as_bytes().to_vec())
    }
    #[cfg(not(windows))]
    {
        plain.as_bytes().to_vec()
    }
}

fn decrypt_secret(blob: &[u8]) -> String {
    if blob.is_empty() {
        return String::new();
    }
    #[cfg(windows)]
    {
        match protect(blob, false) {
            Ok(bytes) => String::from_utf8(bytes).unwrap_or_default(),
            Err(_) => String::from_utf8(blob.to_vec()).unwrap_or_default(),
        }
    }
    #[cfg(not(windows))]
    {
        String::from_utf8(blob.to_vec()).unwrap_or_default()
    }
}

fn mask_secret(plain: &str) -> String {
    let trimmed = plain.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 8 {
        return "••••••••".to_string();
    }
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{head}••••{tail}")
}

fn parse_protocol(raw: &str) -> ApiProtocol {
    match raw {
        "anthropic" => ApiProtocol::Anthropic,
        "gemini" => ApiProtocol::Gemini,
        _ => ApiProtocol::Openai,
    }
}

fn protocol_str(protocol: ApiProtocol) -> &'static str {
    match protocol {
        ApiProtocol::Openai => "openai",
        ApiProtocol::Anthropic => "anthropic",
        ApiProtocol::Gemini => "gemini",
    }
}

fn parse_effort(raw: Option<String>) -> Option<ThinkingEffort> {
    match raw.as_deref() {
        Some("none") => Some(ThinkingEffort::None),
        Some("low") => Some(ThinkingEffort::Low),
        Some("medium") => Some(ThinkingEffort::Medium),
        Some("high") => Some(ThinkingEffort::High),
        _ => None,
    }
}

fn effort_str(effort: ThinkingEffort) -> &'static str {
    match effort {
        ThinkingEffort::None => "none",
        ThinkingEffort::Low => "low",
        ThinkingEffort::Medium => "medium",
        ThinkingEffort::High => "high",
    }
}

fn provider_requires_key(provider_id: &str) -> bool {
    !matches!(provider_id, "ollama" | "custom")
}

// ---------- 旧版文件一次性无损导入 ----------

fn json_str_opt(val: &Value, key: &str) -> Option<String> {
    val.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
}

fn json_i64_opt(val: &Value, key: &str) -> Option<i64> {
    val.get(key)
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f.round() as i64)))
}

fn json_datetime_opt(conn: &Connection, val: &Value, key: &str, fallback: &str) -> String {
    if let Some(raw) = json_str_opt(val, key) {
        return normalize_datetime(Some(&raw));
    }
    if let Some(ms) = json_i64_opt(val, key) {
        return millis_to_datetime_conn(conn, ms);
    }
    fallback.to_string()
}

pub(crate) fn init_ai_storage(db: &Database, data_dir: &Path) -> AppResult<()> {
    db.migrate(AI_MIGRATIONS)?;

    // 兼容早期已创建 `ai_messages` 表但尚未包含 `updated_at` 列的本地数据库
    db.transaction(|tx| {
        let mut stmt = tx.prepare("PRAGMA table_info(ai_messages)")?;
        let has_updated_at = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .any(|name| name == "updated_at");
        drop(stmt);
        if !has_updated_at {
            tx.execute_batch(
                "ALTER TABLE ai_messages ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
                 UPDATE ai_messages SET updated_at = created_at WHERE updated_at = '';",
            )?;
        } else {
            tx.execute_batch(
                "UPDATE ai_messages
                 SET updated_at = datetime(updated_at / 1000.0, 'unixepoch', 'localtime')
                 WHERE typeof(updated_at) IN ('integer', 'real');",
            )?;
        }
        Ok(())
    })?;

    let migrated = db.with_conn(|conn| {
        Ok(get_setting_json(conn, AI_SCOPE, SETTING_LEGACY_MIGRATED)?
            .and_then(|v| v.as_bool())
            .unwrap_or(false))
    })?;
    if migrated {
        return Ok(());
    }

    let legacy_ai_dir = data_dir.join(LEGACY_AI_DIR);
    let legacy_config_path = legacy_ai_dir.join(LEGACY_CONFIG_FILE);
    let legacy_conv_dir = legacy_ai_dir.join(LEGACY_CONVERSATIONS_DIR);

    let legacy_config_val: Option<Value> = if legacy_config_path.exists() {
        std::fs::read(&legacy_config_path).ok().and_then(|bytes| {
            #[cfg(windows)]
            let plain = protect(&bytes, false).unwrap_or(bytes);
            #[cfg(not(windows))]
            let plain = bytes;
            String::from_utf8(plain)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
        })
    } else {
        None
    };

    let mut legacy_convs: Vec<(Value, Value)> = Vec::new();
    let legacy_index_path = legacy_conv_dir.join(LEGACY_INDEX_FILE);
    if legacy_index_path.exists() {
        if let Ok(index_text) = std::fs::read_to_string(&legacy_index_path) {
            if let Ok(entries) = serde_json::from_str::<Vec<Value>>(&index_text) {
                for entry in entries {
                    let Some(id) = json_str_opt(&entry, "id") else {
                        continue;
                    };
                    if validate_conv_id(&id).is_err() {
                        continue;
                    }
                    let file_path = legacy_conv_dir.join(format!("{id}.json"));
                    if let Ok(raw) = std::fs::read_to_string(&file_path) {
                        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
                            legacy_convs.push((entry, val));
                        }
                    }
                }
            }
        }
    }

    db.transaction(|tx| {
        let now = now_datetime();
        if let Some(ref cfg) = legacy_config_val {
            let default_id = cfg
                .get("settings")
                .and_then(|s| s.get("defaultModelConfigId"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if let Some(models) = cfg.get("models").and_then(Value::as_array) {
                for (idx, m) in models.iter().enumerate() {
                    let (Some(id), Some(model_id)) = (json_str_opt(m, "id"), json_str_opt(m, "modelId")) else {
                        continue;
                    };
                    let api_key = m.get("apiKey").and_then(Value::as_str).unwrap_or("");
                    tx.execute(
                        "INSERT OR IGNORE INTO ai_models (
                            id, provider_id, provider_name, name, protocol, base_url, api_key_enc,
                            model_id, enabled, max_tokens, thinking_support, thinking_effort,
                            is_default, sort_order, created_at, updated_at
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                        params![
                            id,
                            json_str_opt(m, "providerId").unwrap_or_else(|| "custom".into()),
                            json_str_opt(m, "providerName"),
                            m.get("name").and_then(Value::as_str).unwrap_or(""),
                            json_str_opt(m, "protocol").unwrap_or_else(|| "openai".into()),
                            m.get("baseUrl").and_then(Value::as_str).unwrap_or(""),
                            encrypt_secret(api_key),
                            model_id,
                            if m.get("enabled").and_then(Value::as_bool).unwrap_or(true) { 1i64 } else { 0i64 },
                            json_i64_opt(m, "maxTokens").filter(|&n| n > 0),
                            json_str_opt(m, "thinkingSupport"),
                            json_str_opt(m, "thinkingEffort"),
                            if !default_id.is_empty() && id == default_id { 1i64 } else { 0i64 },
                            idx as i64,
                            now,
                            now,
                        ],
                    )?;
                }
            }
            if let Some(folders) = cfg.get("folders").and_then(Value::as_array) {
                for (idx, f) in folders.iter().enumerate() {
                    let Some(id) = json_str_opt(f, "id") else {
                        continue;
                    };
                    let name = json_str_opt(f, "name").unwrap_or_else(|| id.clone());
                    let pinned = f.get("pinned").and_then(Value::as_bool).unwrap_or(false);
                    let collapsed = f.get("collapsed").and_then(Value::as_bool).unwrap_or(false);
                    let created_at = json_datetime_opt(tx, f, "createdAt", &now);
                    tx.execute(
                        "INSERT OR IGNORE INTO folders (id, scope, parent_id, name, pinned, collapsed, sort_order, created_at, updated_at)
                         VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![
                            id,
                            AI_SCOPE,
                            name,
                            if pinned { 1i64 } else { 0i64 },
                            if collapsed { 1i64 } else { 0i64 },
                            idx as i64,
                            created_at,
                            now,
                        ],
                    )?;
                }
            }
            if let Some(mcp_ids) = cfg.get("enabledMcpIds").filter(|v| v.is_array()) {
                set_setting_json(tx, AI_SCOPE, SETTING_ENABLED_MCP_IDS, mcp_ids)?;
            }
        }

        for (entry, val) in &legacy_convs {
            let Some(conv_id) = json_str_opt(entry, "id") else {
                continue;
            };
            let title = json_str_opt(entry, "title").unwrap_or_default();
            let provider_id = json_str_opt(entry, "providerId").unwrap_or_default();
            let model_id = json_str_opt(entry, "modelId").unwrap_or_default();
            let conv_created_at = json_datetime_opt(tx, entry, "createdAt", &now);
            let conv_updated_at = json_datetime_opt(tx, entry, "updatedAt", &conv_created_at);
            let messages = val
                .get("messages")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            tx.execute(
                "INSERT OR IGNORE INTO ai_conversations (
                    id, title, model_config_id, provider_id, model_id, workspace_dir,
                    execution_policy, message_count, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    conv_id,
                    title,
                    json_str_opt(val, "modelConfigId"),
                    provider_id,
                    model_id,
                    json_str_opt(val, "workspaceDir"),
                    json_str_opt(val, "executionPolicy"),
                    messages.len() as i64,
                    conv_created_at,
                    conv_updated_at,
                ],
            )?;
            for (seq, m) in messages.iter().enumerate() {
                let Some(msg_id) = json_str_opt(m, "id") else {
                    continue;
                };
                let msg_created_at = json_datetime_opt(tx, m, "createdAt", &conv_updated_at);
                tx.execute(
                    "INSERT OR IGNORE INTO ai_messages (
                        id, conversation_id, seq, role, content, reasoning,
                        attachments_json, tool_calls_json, parts_json,
                        model_config_id, provider_name, model_id, model_name,
                        duration_ms, error, aborted, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
                    params![
                        msg_id,
                        conv_id,
                        seq as i64,
                        json_str_opt(m, "role").unwrap_or_else(|| "user".into()),
                        m.get("content").and_then(Value::as_str).unwrap_or(""),
                        m.get("reasoning").and_then(Value::as_str),
                        m.get("attachments").filter(|v| !v.is_null()).and_then(|v| serde_json::to_string(v).ok()),
                        m.get("toolCalls").filter(|v| !v.is_null()).and_then(|v| serde_json::to_string(v).ok()),
                        m.get("parts").filter(|v| !v.is_null()).and_then(|v| serde_json::to_string(v).ok()),
                        json_str_opt(m, "modelConfigId"),
                        json_str_opt(m, "providerName"),
                        json_str_opt(m, "modelId"),
                        json_str_opt(m, "modelName"),
                        json_i64_opt(m, "durationMs"),
                        json_str_opt(m, "error"),
                        if m.get("aborted").and_then(Value::as_bool).unwrap_or(false) { 1i64 } else { 0i64 },
                        msg_created_at,
                        msg_created_at,
                    ],
                )?;
            }
        }

        if let Some(meta) = legacy_config_val
            .as_ref()
            .and_then(|c| c.get("conversationMeta"))
            .and_then(Value::as_object)
        {
            for (conv_id, raw) in meta {
                let pinned = raw.get("pinned").and_then(Value::as_bool).unwrap_or(false);
                let folder_id = json_str_opt(raw, "folderId");
                let order = json_i64_opt(raw, "order");
                let _ = tx.execute(
                    "UPDATE ai_conversations SET pinned = ?1, folder_id = ?2, sort_order = ?3 WHERE id = ?4",
                    params![if pinned { 1i64 } else { 0i64 }, folder_id, order, conv_id],
                );
            }
        }

        set_setting_json(tx, AI_SCOPE, SETTING_LEGACY_MIGRATED, &Value::Bool(true))?;
        Ok(())
    })
}

// ---------- 内部查询辅助 ----------

fn list_models_conn(conn: &Connection) -> rusqlite::Result<Vec<AiModelView>> {
    let mut stmt = conn.prepare(
        "SELECT id, provider_id, provider_name, name, protocol, base_url, api_key_enc,
                model_id, enabled, max_tokens, thinking_support, thinking_effort, is_default
         FROM ai_models
         ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        let api_key_enc: Vec<u8> = row.get(6)?;
        let plain_key = decrypt_secret(&api_key_enc);
        let has_api_key = !plain_key.trim().is_empty();
        let masked_api_key = mask_secret(&plain_key);
        let protocol_raw: String = row.get(4)?;
        let max_tokens: Option<i64> = row.get(9)?;
        let thinking_effort_raw: Option<String> = row.get(11)?;
        Ok(AiModelView {
            id: row.get(0)?,
            provider_id: row.get(1)?,
            provider_name: row.get(2)?,
            name: row.get(3)?,
            protocol: parse_protocol(&protocol_raw),
            base_url: row.get(5)?,
            has_api_key,
            masked_api_key,
            model_id: row.get(7)?,
            enabled: row.get::<_, i64>(8)? != 0,
            is_default: row.get::<_, i64>(12)? != 0,
            max_tokens: max_tokens.filter(|&n| n > 0).map(|n| n as u32),
            thinking_support: row.get(10)?,
            thinking_effort: parse_effort(thinking_effort_raw),
        })
    })?;
    rows.collect()
}

fn list_conversations_conn(conn: &Connection) -> rusqlite::Result<Vec<ConversationIndexEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, provider_id, model_id, created_at, updated_at, message_count
         FROM ai_conversations
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ConversationIndexEntry {
            id: row.get(0)?,
            title: row.get(1)?,
            provider_id: row.get(2)?,
            model_id: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            message_count: row.get::<_, i64>(6)?.max(0) as usize,
        })
    })?;
    rows.collect()
}

fn read_conversation_meta_conn(
    conn: &Connection,
) -> rusqlite::Result<HashMap<String, AiConversationMetaDto>> {
    let mut map = HashMap::new();
    let mut stmt = conn.prepare(
        "SELECT id, pinned, folder_id, sort_order
         FROM ai_conversations
         WHERE pinned != 0 OR folder_id IS NOT NULL OR sort_order IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)? != 0,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<i64>>(3)?,
        ))
    })?;
    for row in rows {
        let (conv_id, pinned, folder_id, order) = row?;
        map.insert(
            conv_id,
            AiConversationMetaDto {
                pinned: if pinned { Some(true) } else { None },
                folder_id: folder_id.filter(|s| !s.is_empty()),
                order,
            },
        );
    }
    Ok(map)
}

fn update_conversation_counts_tx(tx: &Transaction<'_>, conv_id: &str) -> rusqlite::Result<()> {
    let count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM ai_messages WHERE conversation_id = ?1",
        [conv_id],
        |row| row.get(0),
    )?;
    tx.execute(
        "UPDATE ai_conversations SET message_count = ?1, updated_at = ?2 WHERE id = ?3",
        params![count, now_datetime(), conv_id],
    )?;
    Ok(())
}

// ---------- 后端内部凭据查询（不向前端暴露明文 Key） ----------

pub(crate) async fn resolve_model_credentials(
    db: &Database,
    model_config_id: &str,
) -> AppResult<ResolvedModelCredentials> {
    let id = model_config_id.trim().to_string();
    if id.is_empty() {
        return Err(AppError::invalid_input("Model configuration ID is required."));
    }
    let found = db
        .run_blocking(move |conn| {
            conn.query_row(
                "SELECT id, provider_id, protocol, base_url, api_key_enc, model_id, max_tokens
                 FROM ai_models
                 WHERE id = ?1",
                [&id],
                |row| {
                    let provider_id: String = row.get(1)?;
                    let protocol_raw: String = row.get(2)?;
                    let base_url: String = row.get(3)?;
                    let api_key_enc: Vec<u8> = row.get(4)?;
                    let model_id: String = row.get(5)?;
                    let max_tokens: Option<i64> = row.get(6)?;
                    Ok(ResolvedModelCredentials {
                        endpoint: EndpointConfig {
                            protocol: parse_protocol(&protocol_raw),
                            base_url,
                            api_key: decrypt_secret(&api_key_enc),
                            requires_key: provider_requires_key(&provider_id),
                        },
                        model_id,
                        max_tokens: max_tokens.filter(|&n| n > 0).map(|n| n as u32),
                    })
                },
            )
            .optional()
        })
        .await?;
    found.ok_or_else(|| AppError::new(crate::core::error::AppErrorCode::NotFound, "Model configuration not found."))
}

pub(crate) async fn resolve_model_api_key(
    db: &Database,
    model_config_id: &str,
) -> AppResult<Option<String>> {
    let id = model_config_id.trim().to_string();
    if id.is_empty() {
        return Ok(None);
    }
    db.run_blocking(move |conn| {
        let blob: Option<Vec<u8>> = conn
            .query_row(
                "SELECT api_key_enc FROM ai_models WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(blob.map(|b| decrypt_secret(&b)))
    })
    .await
}

// ---------- 细粒度强类型 SQLite 业务接口 ----------

fn read_string_list_setting(conn: &Connection, key: &str) -> rusqlite::Result<Vec<String>> {
    Ok(get_setting_json(conn, AI_SCOPE, key)?
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.into_iter()
                .filter_map(|x| x.as_str().map(ToString::to_string))
                .collect()
        })
        .unwrap_or_default())
}

pub(crate) async fn read_disabled_builtin_tools(db: &Database) -> AppResult<HashSet<String>> {
    db.run_blocking(|conn| {
        let names = read_string_list_setting(conn, SETTING_DISABLED_BUILTIN_TOOLS)?;
        Ok(names.into_iter().collect())
    })
    .await
}

pub(crate) async fn ai_load_state_impl(
    db: &Database,
    builtin_tools: Vec<AiBuiltinToolInfo>,
) -> AppResult<AiInitialState> {
    db.run_blocking(move |conn| {
        let models = list_models_conn(conn)?;
        let folders: Vec<AiFolderDto> = list_folders(conn, AI_SCOPE)?
            .into_iter()
            .map(|f| AiFolderDto {
                id: f.id,
                name: f.name,
                pinned: f.pinned,
                collapsed: f.collapsed,
                created_at: f.created_at,
            })
            .collect();
        let enabled_mcp_ids = read_string_list_setting(conn, SETTING_ENABLED_MCP_IDS)?;
        let disabled_builtin_tools =
            read_string_list_setting(conn, SETTING_DISABLED_BUILTIN_TOOLS)?;
        let conversation_meta = read_conversation_meta_conn(conn)?;
        let conversations = list_conversations_conn(conn)?;
        Ok(AiInitialState {
            models,
            enabled_mcp_ids,
            disabled_builtin_tools,
            builtin_tools,
            folders,
            conversation_meta,
            conversations,
        })
    })
    .await
}

pub(crate) async fn ai_upsert_model_impl(
    db: &Database,
    input: AiModelUpsertInput,
) -> AppResult<Vec<AiModelView>> {
    if input.model_id.trim().is_empty() {
        return Err(AppError::invalid_input("Model ID is required."));
    }
    let model_row_id = if input.id.trim().is_empty() {
        next_id_string()
    } else {
        input.id.trim().to_string()
    };
    db.run_transaction(move |tx| {
        let now = now_datetime();
        let existing_key: Option<Vec<u8>> = tx
            .query_row(
                "SELECT api_key_enc FROM ai_models WHERE id = ?1",
                [&model_row_id],
                |row| row.get(0),
            )
            .optional()?;

        let api_key_enc = match input.api_key.as_deref() {
            Some(raw) => encrypt_secret(raw.trim()),
            None => existing_key.unwrap_or_default(),
        };

        let next_order: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM ai_models",
            [],
            |row| row.get(0),
        )?;

        let existing_default: Option<i64> = tx
            .query_row(
                "SELECT is_default FROM ai_models WHERE id = ?1",
                [&model_row_id],
                |row| row.get(0),
            )
            .optional()?;

        let is_default_flag = match input.is_default {
            Some(true) => {
                tx.execute("UPDATE ai_models SET is_default = 0", [])?;
                1i64
            }
            Some(false) => 0i64,
            None => {
                if let Some(prev) = existing_default {
                    prev
                } else {
                    let any_default: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM ai_models WHERE is_default = 1)",
                        [],
                        |row| row.get(0),
                    )?;
                    if any_default { 0i64 } else { 1i64 }
                }
            }
        };

        let provider_name = input
            .provider_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string);
        let thinking_support = input
            .thinking_support
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && *s != "auto")
            .map(ToString::to_string);
        let thinking_effort = input.thinking_effort.map(effort_str);

        tx.execute(
            "INSERT INTO ai_models (
                id, provider_id, provider_name, name, protocol, base_url, api_key_enc,
                model_id, enabled, max_tokens, thinking_support, thinking_effort,
                is_default, sort_order, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
             ON CONFLICT(id) DO UPDATE SET
                provider_id = excluded.provider_id,
                provider_name = excluded.provider_name,
                name = excluded.name,
                protocol = excluded.protocol,
                base_url = excluded.base_url,
                api_key_enc = excluded.api_key_enc,
                model_id = excluded.model_id,
                enabled = excluded.enabled,
                max_tokens = excluded.max_tokens,
                thinking_support = excluded.thinking_support,
                thinking_effort = excluded.thinking_effort,
                is_default = excluded.is_default,
                updated_at = excluded.updated_at",
            params![
                model_row_id,
                input.provider_id,
                provider_name,
                input.name.trim(),
                protocol_str(input.protocol),
                input.base_url.trim(),
                api_key_enc,
                input.model_id.trim(),
                if input.enabled { 1i64 } else { 0i64 },
                input.max_tokens.filter(|&n| n > 0).map(i64::from),
                thinking_support,
                thinking_effort,
                is_default_flag,
                next_order,
                now,
                now,
            ],
        )?;
        list_models_conn(tx)
    })
    .await
}

pub(crate) async fn ai_delete_model_impl(db: &Database, id: String) -> AppResult<Vec<AiModelView>> {
    db.run_transaction(move |tx| {
        let was_default: bool = tx
            .query_row(
                "SELECT is_default != 0 FROM ai_models WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or(false);
        tx.execute("DELETE FROM ai_models WHERE id = ?1", [&id])?;
        if was_default {
            if let Some(next_id) = tx
                .query_row(
                    "SELECT id FROM ai_models WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC LIMIT 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
            {
                tx.execute(
                    "UPDATE ai_models SET is_default = 1 WHERE id = ?1",
                    [next_id],
                )?;
            }
        }
        list_models_conn(tx)
    })
    .await
}

pub(crate) async fn ai_set_default_model_impl(
    db: &Database,
    id: Option<String>,
) -> AppResult<Vec<AiModelView>> {
    db.run_transaction(move |tx| {
        tx.execute("UPDATE ai_models SET is_default = 0", [])?;
        if let Some(target_id) = id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            tx.execute(
                "UPDATE ai_models SET is_default = 1, updated_at = ?1 WHERE id = ?2",
                params![now_datetime(), target_id],
            )?;
        }
        list_models_conn(tx)
    })
    .await
}

pub(crate) async fn ai_set_model_enabled_impl(
    db: &Database,
    id: String,
    enabled: bool,
) -> AppResult<Vec<AiModelView>> {
    db.run_transaction(move |tx| {
        tx.execute(
            "UPDATE ai_models SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
            params![if enabled { 1i64 } else { 0i64 }, now_datetime(), id],
        )?;
        list_models_conn(tx)
    })
    .await
}

pub(crate) async fn ai_set_model_thinking_effort_impl(
    db: &Database,
    id: String,
    effort: ThinkingEffort,
) -> AppResult<()> {
    db.run_transaction(move |tx| {
        tx.execute(
            "UPDATE ai_models SET thinking_effort = ?1, updated_at = ?2 WHERE id = ?3",
            params![effort_str(effort), now_datetime(), id],
        )?;
        Ok(())
    })
    .await
}

pub(crate) async fn ai_set_enabled_mcp_ids_impl(db: &Database, ids: Vec<String>) -> AppResult<()> {
    db.run_transaction(move |tx| {
        let val = Value::Array(ids.into_iter().map(Value::String).collect());
        set_setting_json(tx, AI_SCOPE, SETTING_ENABLED_MCP_IDS, &val)
    })
    .await
}

pub(crate) async fn ai_set_disabled_builtin_tools_impl(
    db: &Database,
    names: Vec<String>,
) -> AppResult<()> {
    db.run_transaction(move |tx| {
        let mut seen = HashSet::new();
        let deduped: Vec<Value> = names
            .into_iter()
            .filter_map(|raw| {
                let trimmed = raw.trim().to_string();
                if trimmed.is_empty() || !seen.insert(trimmed.clone()) {
                    None
                } else {
                    Some(Value::String(trimmed))
                }
            })
            .collect();
        set_setting_json(
            tx,
            AI_SCOPE,
            SETTING_DISABLED_BUILTIN_TOOLS,
            &Value::Array(deduped),
        )
    })
    .await
}

pub(crate) async fn ai_upsert_folder_impl(
    db: &Database,
    folder: AiFolderDto,
) -> AppResult<AiFolderDto> {
    let folder_id = if folder.id.trim().is_empty() {
        next_id_string()
    } else {
        folder.id.trim().to_string()
    };
    db.run_transaction(move |tx| {
        let now = now_datetime();
        let created_at = normalize_datetime(Some(&folder.created_at));
        let next_order: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM folders WHERE scope = ?1",
            [AI_SCOPE],
            |row| row.get(0),
        )?;
        let rec = FolderRecord {
            id: folder_id.clone(),
            parent_id: None,
            name: folder.name.clone(),
            pinned: folder.pinned,
            collapsed: folder.collapsed,
            sort_order: next_order,
            created_at: created_at.clone(),
        };
        tx.execute(
            "INSERT INTO folders (id, scope, parent_id, name, pinned, collapsed, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 pinned = excluded.pinned,
                 collapsed = excluded.collapsed,
                 updated_at = excluded.updated_at",
            params![
                rec.id,
                AI_SCOPE,
                rec.parent_id,
                rec.name,
                if rec.pinned { 1i64 } else { 0i64 },
                if rec.collapsed { 1i64 } else { 0i64 },
                rec.sort_order,
                rec.created_at,
                now,
            ],
        )?;
        Ok(AiFolderDto {
            id: folder_id,
            name: folder.name,
            pinned: folder.pinned,
            collapsed: folder.collapsed,
            created_at,
        })
    })
    .await
}

pub(crate) async fn ai_delete_folder_impl(db: &Database, id: String) -> AppResult<()> {
    db.run_transaction(move |tx| {
        tx.execute(
            "DELETE FROM folders WHERE scope = ?1 AND id = ?2",
            params![AI_SCOPE, id],
        )?;
        Ok(())
    })
    .await
}

pub(crate) async fn ai_read_conversation_impl(
    db: &Database,
    id: String,
) -> AppResult<Option<AiConversationDetail>> {
    validate_conv_id(&id)?;
    db.run_blocking(move |conn| {
        let conv_row = conn
            .query_row(
                "SELECT id, title, model_config_id, provider_id, model_id, workspace_dir,
                        execution_policy, created_at, updated_at, message_count
                 FROM ai_conversations
                 WHERE id = ?1",
                [&id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, String>(8)?,
                        row.get::<_, i64>(9)?,
                    ))
                },
            )
            .optional()?;

        let Some((
            conv_id,
            title,
            model_config_id,
            provider_id,
            model_id,
            workspace_dir,
            execution_policy,
            created_at,
            updated_at,
            message_count,
        )) = conv_row
        else {
            return Ok(None);
        };

        let mut stmt = conn.prepare(
            "SELECT id, role, content, reasoning, attachments_json, tool_calls_json, parts_json,
                    model_config_id, provider_name, model_id, model_name, duration_ms, error,
                    aborted, created_at
             FROM ai_messages
             WHERE conversation_id = ?1
             ORDER BY seq ASC",
        )?;
        let messages = stmt
            .query_map([&conv_id], |row| {
                Ok(AiMessageDto {
                    id: row.get(0)?,
                    role: row.get(1)?,
                    content: row.get(2)?,
                    reasoning: row.get(3)?,
                    attachments_json: row.get(4)?,
                    tool_calls_json: row.get(5)?,
                    parts_json: row.get(6)?,
                    model_config_id: row.get(7)?,
                    provider_name: row.get(8)?,
                    model_id: row.get(9)?,
                    model_name: row.get(10)?,
                    duration_ms: row.get(11)?,
                    error: row.get(12)?,
                    aborted: row.get::<_, i64>(13)? != 0,
                    created_at: row.get(14)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(Some(AiConversationDetail {
            id: conv_id,
            title,
            model_config_id,
            provider_id,
            model_id,
            workspace_dir,
            execution_policy,
            created_at,
            updated_at,
            message_count: message_count.max(0) as usize,
            messages,
        }))
    })
    .await
}

pub(crate) async fn ai_upsert_conversation_impl(
    db: &Database,
    input: AiConversationUpsertInput,
) -> AppResult<AiConversationUpsertResult> {
    let conv_id = if input.id.trim().is_empty() {
        next_id_string()
    } else {
        input.id.trim().to_string()
    };
    validate_conv_id(&conv_id)?;
    db.run_transaction(move |tx| {
        let now = now_datetime();
        let created_at = if input.created_at.trim().is_empty() {
            now.clone()
        } else {
            normalize_datetime(Some(&input.created_at))
        };
        let updated_at = if input.updated_at.trim().is_empty() {
            now
        } else {
            normalize_datetime(Some(&input.updated_at))
        };
        tx.execute(
            "INSERT INTO ai_conversations (
                id, title, model_config_id, provider_id, model_id, workspace_dir,
                execution_policy, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                model_config_id = excluded.model_config_id,
                provider_id = excluded.provider_id,
                model_id = excluded.model_id,
                workspace_dir = excluded.workspace_dir,
                execution_policy = excluded.execution_policy,
                updated_at = excluded.updated_at",
            params![
                &conv_id,
                input.title,
                input.model_config_id,
                input.provider_id,
                input.model_id,
                input.workspace_dir,
                input.execution_policy,
                created_at,
                updated_at,
            ],
        )?;
        let conversations = list_conversations_conn(tx)?;
        Ok(AiConversationUpsertResult {
            id: conv_id,
            conversations,
        })
    })
    .await
}

pub(crate) async fn ai_update_conversation_meta_impl(
    db: &Database,
    updates: Vec<AiConversationMetaUpdate>,
) -> AppResult<()> {
    db.run_transaction(move |tx| {
        for item in updates {
            tx.execute(
                "UPDATE ai_conversations
                 SET pinned = ?1, folder_id = ?2, sort_order = ?3
                 WHERE id = ?4",
                params![
                    if item.pinned { 1i64 } else { 0i64 },
                    item.folder_id,
                    item.order,
                    item.conversation_id,
                ],
            )?;
        }
        Ok(())
    })
    .await
}

pub(crate) async fn ai_delete_conversation_impl(
    db: &Database,
    id: String,
) -> AppResult<Vec<ConversationIndexEntry>> {
    validate_conv_id(&id)?;
    db.run_transaction(move |tx| {
        tx.execute("DELETE FROM ai_conversations WHERE id = ?1", [&id])?;
        list_conversations_conn(tx)
    })
    .await
}

pub(crate) async fn ai_upsert_message_impl(
    db: &Database,
    conversation_id: String,
    message: AiMessageDto,
) -> AppResult<AiMessageUpsertResult> {
    validate_conv_id(&conversation_id)?;
    let message_id = if message.id.trim().is_empty() {
        next_id_string()
    } else {
        message.id.trim().to_string()
    };
    db.run_transaction(move |tx| {
        let now = now_datetime();
        let created_at = if message.created_at.trim().is_empty() {
            now.clone()
        } else {
            normalize_datetime(Some(&message.created_at))
        };
        let existing_seq: Option<i64> = tx
            .query_row(
                "SELECT seq FROM ai_messages WHERE id = ?1",
                [&message_id],
                |row| row.get(0),
            )
            .optional()?;
        let seq = match existing_seq {
            Some(s) => s,
            None => tx.query_row(
                "SELECT COALESCE(MAX(seq) + 1, 0) FROM ai_messages WHERE conversation_id = ?1",
                [&conversation_id],
                |row| row.get(0),
            )?,
        };

        tx.execute(
            "INSERT INTO ai_messages (
                id, conversation_id, seq, role, content, reasoning,
                attachments_json, tool_calls_json, parts_json,
                model_config_id, provider_name, model_id, model_name,
                duration_ms, error, aborted, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
             ON CONFLICT(id) DO UPDATE SET
                role = excluded.role,
                content = excluded.content,
                reasoning = excluded.reasoning,
                attachments_json = excluded.attachments_json,
                tool_calls_json = excluded.tool_calls_json,
                parts_json = excluded.parts_json,
                model_config_id = excluded.model_config_id,
                provider_name = excluded.provider_name,
                model_id = excluded.model_id,
                model_name = excluded.model_name,
                duration_ms = excluded.duration_ms,
                error = excluded.error,
                aborted = excluded.aborted,
                updated_at = excluded.updated_at",
            params![
                &message_id,
                conversation_id,
                seq,
                message.role,
                message.content,
                message.reasoning,
                message.attachments_json,
                message.tool_calls_json,
                message.parts_json,
                message.model_config_id,
                message.provider_name,
                message.model_id,
                message.model_name,
                message.duration_ms,
                message.error,
                if message.aborted { 1i64 } else { 0i64 },
                created_at,
                now,
            ],
        )?;
        update_conversation_counts_tx(tx, &conversation_id)?;
        let conversations = list_conversations_conn(tx)?;
        Ok(AiMessageUpsertResult {
            id: message_id,
            conversations,
        })
    })
    .await
}

pub(crate) async fn ai_delete_message_impl(
    db: &Database,
    conversation_id: String,
    message_id: String,
) -> AppResult<Vec<ConversationIndexEntry>> {
    validate_conv_id(&conversation_id)?;
    db.run_transaction(move |tx| {
        tx.execute(
            "DELETE FROM ai_messages WHERE conversation_id = ?1 AND id = ?2",
            params![&conversation_id, &message_id],
        )?;
        update_conversation_counts_tx(tx, &conversation_id)?;
        list_conversations_conn(tx)
    })
    .await
}

pub(crate) async fn ai_truncate_messages_from_impl(
    db: &Database,
    conversation_id: String,
    from_message_id: String,
    inclusive: bool,
) -> AppResult<Vec<ConversationIndexEntry>> {
    validate_conv_id(&conversation_id)?;
    db.run_transaction(move |tx| {
        let target_seq: Option<i64> = tx
            .query_row(
                "SELECT seq FROM ai_messages WHERE conversation_id = ?1 AND id = ?2",
                params![&conversation_id, &from_message_id],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(seq) = target_seq {
            if inclusive {
                tx.execute(
                    "DELETE FROM ai_messages WHERE conversation_id = ?1 AND seq >= ?2",
                    params![&conversation_id, seq],
                )?;
            } else {
                tx.execute(
                    "DELETE FROM ai_messages WHERE conversation_id = ?1 AND seq > ?2",
                    params![&conversation_id, seq],
                )?;
            }
            update_conversation_counts_tx(tx, &conversation_id)?;
        }
        list_conversations_conn(tx)
    })
    .await
}

pub(crate) async fn ai_clear_messages_impl(
    db: &Database,
    conversation_id: String,
) -> AppResult<Vec<ConversationIndexEntry>> {
    validate_conv_id(&conversation_id)?;
    db.run_transaction(move |tx| {
        tx.execute(
            "DELETE FROM ai_messages WHERE conversation_id = ?1",
            [&conversation_id],
        )?;
        update_conversation_counts_tx(tx, &conversation_id)?;
        list_conversations_conn(tx)
    })
    .await
}
