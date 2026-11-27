//! MCP 连接配置 SQLite 持久化层（基于全应用统一基座 `core::db::Database`）。
//!
//! 连接配置存放在 `mcp_connections` 表，`transport` 字段记录 `stdio` 或 `streaming_http`，
//! `config_json` 直接保存规范化后的配置 JSON 文本。

use std::collections::{HashMap, HashSet};

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::core::db::{now_millis, Database, Migration};
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

use super::config::McpConfig;

const MCP_MIGRATIONS: &[Migration] = &[Migration {
    id: "mcp_001_init",
    sql: r#"
        CREATE TABLE IF NOT EXISTS mcp_connections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            transport TEXT NOT NULL,
            config_json TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mcp_connections_order
            ON mcp_connections(sort_order ASC, created_at ASC);
    "#,
}];

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct StoredConnection {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) config: McpConfig,
}

fn validate(connections: &[StoredConnection]) -> AppResult<()> {
    let mut ids = HashSet::new();
    if connections.iter().any(|item| {
        item.id.trim().is_empty() || item.name.trim().is_empty() || !ids.insert(&item.id)
    }) {
        return Err(AppError::invalid_input(
            "The saved MCP connections contain an invalid name or ID.",
        ));
    }
    Ok(())
}

pub(crate) fn init_mcp_storage(db: &Database) -> AppResult<()> {
    db.migrate(MCP_MIGRATIONS)
}

pub(crate) async fn load_stored_connections(db: &Database) -> AppResult<Vec<StoredConnection>> {
    let rows = db
        .run_blocking(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, config_json
                 FROM mcp_connections
                 ORDER BY sort_order ASC, created_at ASC",
            )?;
            let mapped = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?;
            mapped.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await?;

    let mut connections = Vec::with_capacity(rows.len());
    for (id, name, raw_json) in rows {
        let config: McpConfig = serde_json::from_str(&raw_json).map_err(|err| {
            AppError::io(format!("Could not decode the saved MCP configuration: {err}"))
        })?;
        connections.push(StoredConnection { id, name, config });
    }
    Ok(connections)
}

pub(crate) async fn save_stored_connections(
    db: &Database,
    mut connections: Vec<StoredConnection>,
) -> AppResult<Vec<StoredConnection>> {
    for item in &mut connections {
        if item.id.trim().is_empty() {
            item.id = next_id_string();
        }
    }
    validate(&connections)?;

    let saved = connections.clone();
    let mut prepared = Vec::with_capacity(connections.len());
    for (idx, item) in connections.into_iter().enumerate() {
        let transport = item.config.transport_kind();
        let config_json = serde_json::to_string(&item.config).map_err(|err| {
            AppError::internal(format!("Could not encode the MCP configuration: {err}"))
        })?;
        prepared.push((item.id, item.name, transport, config_json, idx as i64));
    }

    db.run_transaction(move |tx| {
        let now = now_millis();
        let mut created_map: HashMap<String, i64> = HashMap::new();
        {
            let mut stmt = tx.prepare("SELECT id, created_at FROM mcp_connections")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?;
            for row in rows {
                let (id, created_at) = row?;
                created_map.insert(id, created_at);
            }
        }

        let keep_ids: HashSet<&str> = prepared.iter().map(|(id, ..)| id.as_str()).collect();
        for old_id in created_map.keys() {
            if !keep_ids.contains(old_id.as_str()) {
                tx.execute("DELETE FROM mcp_connections WHERE id = ?1", [old_id])?;
            }
        }

        for (id, name, transport, config_json, sort_order) in prepared {
            let created_at = created_map.get(&id).copied().unwrap_or(now);
            tx.execute(
                "INSERT INTO mcp_connections (
                    id, name, transport, config_json, sort_order, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    transport = excluded.transport,
                    config_json = excluded.config_json,
                    sort_order = excluded.sort_order,
                    updated_at = excluded.updated_at",
                params![id, name, transport, config_json, sort_order, created_at, now],
            )?;
        }
        Ok(())
    })
    .await?;

    Ok(saved)
}
