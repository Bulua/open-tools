//! 剪贴板历史 SQLite 持久化层（基于全应用统一基座 `core::db::Database`）。
//!
//! 历史正文存放在 `clipboard_items` 表（`id` 使用雪花主键，`content_hash` 唯一去重），
//! 运行开关与上限配置复用公共 `app_settings` 表（`scope = 'clipboard'`）。

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::core::db::{
    now_datetime,
    settings::{get_setting_json, set_setting_json},
    Database, Migration,
};
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

const CLIPBOARD_SCOPE: &str = "clipboard";
const SETTING_ENABLED: &str = "enabled";
const SETTING_MAX_ITEMS: &str = "maxItems";

pub(super) const MAX_ENTRY_BYTES: usize = 256 * 1024;
pub(super) const MAX_HISTORY_ITEMS: usize = 1000;
const DEFAULT_MAX_ITEMS: usize = 200;
const MAX_RECENT_BYTES: usize = 4 * 1024 * 1024;
const PREVIEW_MAX_CHARS: usize = 420;
const ACTIVE_RETENTION_FILTER: &str = "updated_at > datetime('now', 'localtime', '-7 days')";
const EXPIRED_RETENTION_FILTER: &str = "updated_at <= datetime('now', 'localtime', '-7 days')";

const CLIPBOARD_MIGRATIONS: &[Migration] = &[Migration {
    id: "clipboard_001_init",
    sql: r#"
        CREATE TABLE IF NOT EXISTS clipboard_items (
            id TEXT PRIMARY KEY,
            content_hash TEXT NOT NULL UNIQUE,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_clipboard_items_updated_at
            ON clipboard_items(updated_at DESC);
    "#,
}];

#[derive(Clone, Copy)]
pub(super) struct ClipboardSettings {
    pub(super) enabled: bool,
    pub(super) max_items: usize,
}

pub(super) struct ClipboardEntryRow {
    pub(super) id: String,
    pub(super) preview: String,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

pub(crate) fn init_clipboard_storage(db: &Database) -> AppResult<()> {
    db.migrate(CLIPBOARD_MIGRATIONS)
}

pub(super) fn content_hash_hex(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

pub(super) fn preview(text: &str) -> String {
    let mut chars = text.chars();
    let mut out: String = chars.by_ref().take(PREVIEW_MAX_CHARS).collect();
    if chars.next().is_some() {
        out.push('…');
    }
    out
}

fn read_settings_conn(conn: &Connection) -> rusqlite::Result<ClipboardSettings> {
    let enabled = get_setting_json(conn, CLIPBOARD_SCOPE, SETTING_ENABLED)?
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let max_items = get_setting_json(conn, CLIPBOARD_SCOPE, SETTING_MAX_ITEMS)?
        .and_then(|v| v.as_u64())
        .map(|n| (n as usize).clamp(1, MAX_HISTORY_ITEMS))
        .unwrap_or(DEFAULT_MAX_ITEMS);
    Ok(ClipboardSettings { enabled, max_items })
}

fn prune_tx(tx: &Transaction<'_>, max_items: usize) -> rusqlite::Result<bool> {
    let mut changed = false;
    let expired_sql = format!("DELETE FROM clipboard_items WHERE {EXPIRED_RETENTION_FILTER}");
    if tx.execute(&expired_sql, [])? > 0 {
        changed = true;
    }

    let mut overflow_ids = Vec::new();
    {
        let mut stmt = tx.prepare(
            "SELECT id, LENGTH(CAST(content AS BLOB))
             FROM clipboard_items
             ORDER BY updated_at DESC, id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut count: usize = 0;
        let mut total_bytes: usize = 0;
        for row in rows {
            let (id, byte_len) = row?;
            count += 1;
            total_bytes = total_bytes.saturating_add(byte_len.max(0) as usize);
            if count > max_items || total_bytes > MAX_RECENT_BYTES {
                overflow_ids.push(id);
            }
        }
    }

    for id in overflow_ids {
        tx.execute("DELETE FROM clipboard_items WHERE id = ?1", [id])?;
        changed = true;
    }
    Ok(changed)
}

pub(super) fn load_settings_sync(db: &Database) -> AppResult<ClipboardSettings> {
    db.with_conn(read_settings_conn)
}

pub(super) fn save_enabled_sync(db: &Database, enabled: bool) -> AppResult<()> {
    db.transaction(move |tx| set_setting_json(tx, CLIPBOARD_SCOPE, SETTING_ENABLED, &Value::Bool(enabled)))
}

pub(super) fn record_entry_sync(db: &Database, text: String) -> AppResult<()> {
    let content_hash = content_hash_hex(&text);
    let id = next_id_string();
    let now = now_datetime();
    db.transaction(move |tx| {
        let settings = read_settings_conn(tx)?;
        tx.execute(
            "INSERT INTO clipboard_items (
                id, content_hash, content, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(content_hash) DO UPDATE SET
                content = excluded.content,
                updated_at = excluded.updated_at",
            params![id, content_hash, text, &now, &now],
        )?;
        prune_tx(tx, settings.max_items)?;
        Ok(())
    })
}

pub(super) fn prune_entries_sync(db: &Database) -> AppResult<bool> {
    db.transaction(|tx| {
        let settings = read_settings_conn(tx)?;
        prune_tx(tx, settings.max_items)
    })
}

pub(super) async fn save_max_items(db: &Database, max_items: usize) -> AppResult<()> {
    if !(1..=MAX_HISTORY_ITEMS).contains(&max_items) {
        return Err(AppError::invalid_input("Invalid clipboard history limit."));
    }
    db.run_transaction(move |tx| {
        set_setting_json(
            tx,
            CLIPBOARD_SCOPE,
            SETTING_MAX_ITEMS,
            &Value::from(max_items as u64),
        )?;
        prune_tx(tx, max_items)?;
        Ok(())
    })
    .await
}

pub(super) async fn list_entries(
    db: &Database,
    query: String,
) -> AppResult<(ClipboardSettings, Vec<ClipboardEntryRow>)> {
    let needle = query.trim().to_lowercase();
    db.run_blocking(move |conn| {
        let settings = read_settings_conn(conn)?;
        if needle.is_empty() {
            let sql = format!(
                "SELECT id, SUBSTR(content, 1, {}), created_at, updated_at
                 FROM clipboard_items
                 WHERE {ACTIVE_RETENTION_FILTER}
                 ORDER BY updated_at DESC, id DESC
                 LIMIT ?1",
                PREVIEW_MAX_CHARS + 1
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([settings.max_items as i64], |row| {
                let raw_head: String = row.get(1)?;
                Ok(ClipboardEntryRow {
                    id: row.get(0)?,
                    preview: preview(&raw_head),
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })?;
            Ok((settings, rows.collect::<rusqlite::Result<Vec<_>>>()?))
        } else {
            let sql = format!(
                "SELECT id, content, created_at, updated_at
                 FROM clipboard_items
                 WHERE {ACTIVE_RETENTION_FILTER}
                 ORDER BY updated_at DESC, id DESC"
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?;
            let mut matched = Vec::new();
            for row in rows {
                let (id, content, created_at, updated_at) = row?;
                if content.to_lowercase().contains(&needle) {
                    matched.push(ClipboardEntryRow {
                        id,
                        preview: preview(&content),
                        created_at,
                        updated_at,
                    });
                    if matched.len() >= settings.max_items {
                        break;
                    }
                }
            }
            Ok((settings, matched))
        }
    })
    .await
}

pub(super) async fn get_entry_content(db: &Database, id: String) -> AppResult<Option<String>> {
    let trimmed = id.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    db.run_blocking(move |conn| {
        let sql = format!(
            "SELECT content
             FROM clipboard_items
             WHERE id = ?1 AND {ACTIVE_RETENTION_FILTER}"
        );
        conn.query_row(&sql, [&trimmed], |row| row.get::<_, String>(0))
            .optional()
    })
    .await
}

pub(super) async fn delete_entry(db: &Database, id: String) -> AppResult<Option<String>> {
    let trimmed = id.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    db.run_transaction(move |tx| {
        let hash: Option<String> = tx
            .query_row(
                "SELECT content_hash FROM clipboard_items WHERE id = ?1",
                [&trimmed],
                |row| row.get(0),
            )
            .optional()?;
        if hash.is_some() {
            tx.execute("DELETE FROM clipboard_items WHERE id = ?1", [&trimmed])?;
        }
        Ok(hash)
    })
    .await
}

pub(super) async fn clear_entries(db: &Database) -> AppResult<()> {
    db.run_transaction(|tx| {
        tx.execute("DELETE FROM clipboard_items", [])?;
        Ok(())
    })
    .await
}
