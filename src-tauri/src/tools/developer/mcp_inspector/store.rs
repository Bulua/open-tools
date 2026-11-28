//! MCP 连接配置 SQLite 持久化层（基于全应用统一基座 `core::db::Database`）。
//!
//! 连接配置存放在单张 `mcp_connections` 表，`transport` 字段区分 `stdio` 或 `streaming_http`：
//! - 标量字段（`command`、`cwd`、`url`、`bearer_token_env_var`）存为独立列；
//! - 集合字段（`args`、`env`、`env_vars`、`headers`、`env_http_headers`）存为独立小 JSON 列，
//!   不再将整份配置打包进单一 `config_json`。

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};

use crate::core::db::{now_datetime, Database, Migration};
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

use super::config::{HttpConfig, McpConfig};

const MCP_MIGRATIONS: &[Migration] = &[
    Migration {
        id: "mcp_001_init",
        sql: r#"
            CREATE TABLE IF NOT EXISTS mcp_connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                transport TEXT NOT NULL,
                config_json TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_mcp_connections_order
                ON mcp_connections(sort_order ASC, created_at ASC);
        "#,
    },
    Migration {
        id: "mcp_002_datetime_format",
        sql: r#"
            UPDATE mcp_connections
            SET created_at = datetime(created_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(created_at) IN ('integer', 'real');

            UPDATE mcp_connections
            SET updated_at = datetime(updated_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(updated_at) IN ('integer', 'real');
        "#,
    },
];

const MCP_SPLIT_CONFIG_MIGRATION_ID: &str = "mcp_003_split_config_columns";

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct StoredConnection {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) config: McpConfig,
}

struct McpColumns {
    transport: &'static str,
    command: Option<String>,
    args: Option<String>,
    cwd: Option<String>,
    env: Option<String>,
    env_vars: Option<String>,
    url: Option<String>,
    headers: Option<String>,
    env_http_headers: Option<String>,
    bearer_token_env_var: Option<String>,
}

struct RawConnectionRow {
    id: String,
    name: String,
    transport: String,
    command: Option<String>,
    args: Option<String>,
    cwd: Option<String>,
    env: Option<String>,
    env_vars: Option<String>,
    url: Option<String>,
    headers: Option<String>,
    env_http_headers: Option<String>,
    bearer_token_env_var: Option<String>,
}

fn encode_json_vec(items: &[String]) -> Result<Option<String>, serde_json::Error> {
    if items.is_empty() {
        Ok(None)
    } else {
        serde_json::to_string(items).map(Some)
    }
}

fn encode_json_map(map: &HashMap<String, String>) -> Result<Option<String>, serde_json::Error> {
    if map.is_empty() {
        Ok(None)
    } else {
        let sorted: BTreeMap<&String, &String> = map.iter().collect();
        serde_json::to_string(&sorted).map(Some)
    }
}

fn decode_json_vec(raw: Option<String>, field: &str) -> AppResult<Vec<String>> {
    match raw {
        Some(text) if !text.trim().is_empty() => serde_json::from_str(&text)
            .map_err(|err| AppError::io(format!("Could not decode MCP {field} column: {err}"))),
        _ => Ok(Vec::new()),
    }
}

fn decode_json_map(raw: Option<String>, field: &str) -> AppResult<HashMap<String, String>> {
    match raw {
        Some(text) if !text.trim().is_empty() => serde_json::from_str(&text)
            .map_err(|err| AppError::io(format!("Could not decode MCP {field} column: {err}"))),
        _ => Ok(HashMap::new()),
    }
}

fn config_to_columns(config: &McpConfig) -> Result<McpColumns, serde_json::Error> {
    let transport = config.transport_kind();
    match config {
        McpConfig::Stdio {
            command,
            args,
            env,
            env_vars,
            cwd,
        } => Ok(McpColumns {
            transport,
            command: Some(command.clone()),
            args: encode_json_vec(args)?,
            cwd: cwd.clone(),
            env: encode_json_map(env)?,
            env_vars: encode_json_vec(env_vars)?,
            url: None,
            headers: None,
            env_http_headers: None,
            bearer_token_env_var: None,
        }),
        McpConfig::Http(http) => Ok(McpColumns {
            transport,
            command: None,
            args: None,
            cwd: None,
            env: None,
            env_vars: None,
            url: Some(http.url.clone()),
            headers: encode_json_map(&http.headers)?,
            env_http_headers: encode_json_map(&http.env_http_headers)?,
            bearer_token_env_var: http.bearer_token_env_var.clone(),
        }),
    }
}

fn columns_to_config(row: RawConnectionRow) -> AppResult<McpConfig> {
    match row.transport.as_str() {
        "stdio" => Ok(McpConfig::Stdio {
            command: row.command.unwrap_or_default(),
            args: decode_json_vec(row.args, "args")?,
            env: decode_json_map(row.env, "env")?,
            env_vars: decode_json_vec(row.env_vars, "env_vars")?,
            cwd: row.cwd,
        }),
        "streaming_http" | "http" => Ok(McpConfig::Http(HttpConfig {
            url: row.url.unwrap_or_default(),
            headers: decode_json_map(row.headers, "headers")?,
            env_http_headers: decode_json_map(row.env_http_headers, "env_http_headers")?,
            bearer_token_env_var: row.bearer_token_env_var,
        })),
        other => Err(AppError::io(format!(
            "Unsupported MCP transport stored in database: {other}"
        ))),
    }
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

fn table_columns_conn(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("PRAGMA table_info(mcp_connections)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    rows.collect()
}

fn migrate_split_config_columns(db: &Database) -> AppResult<()> {
    db.transaction(|tx| {
        let already: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE id = ?1)",
            [MCP_SPLIT_CONFIG_MIGRATION_ID],
            |row| row.get(0),
        )?;
        if already {
            return Ok(());
        }

        let has_config_json = table_columns_conn(tx)?
            .iter()
            .any(|col| col == "config_json");

        if has_config_json {
            let legacy_rows = {
                let mut stmt = tx.prepare(
                    "SELECT id, name, config_json, sort_order, created_at, updated_at
                     FROM mcp_connections",
                )?;
                let mapped = stmt.query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                })?;
                mapped.collect::<rusqlite::Result<Vec<_>>>()?
            };

            tx.execute_batch(
                "CREATE TABLE mcp_connections_new (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    transport TEXT NOT NULL,
                    command TEXT,
                    args TEXT,
                    cwd TEXT,
                    env TEXT,
                    env_vars TEXT,
                    url TEXT,
                    headers TEXT,
                    env_http_headers TEXT,
                    bearer_token_env_var TEXT,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
            )?;

            for (id, name, raw_json, sort_order, created_at, updated_at) in legacy_rows {
                let config: McpConfig = serde_json::from_str(&raw_json).map_err(|err| {
                    rusqlite::Error::FromSqlConversionFailure(
                        2,
                        rusqlite::types::Type::Text,
                        Box::new(err),
                    )
                })?;
                let cols = config_to_columns(&config)
                    .map_err(|err| rusqlite::Error::ToSqlConversionFailure(Box::new(err)))?;
                tx.execute(
                    "INSERT INTO mcp_connections_new (
                        id, name, transport,
                        command, args, cwd, env, env_vars,
                        url, headers, env_http_headers, bearer_token_env_var,
                        sort_order, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                    params![
                        id,
                        name,
                        cols.transport,
                        cols.command,
                        cols.args,
                        cols.cwd,
                        cols.env,
                        cols.env_vars,
                        cols.url,
                        cols.headers,
                        cols.env_http_headers,
                        cols.bearer_token_env_var,
                        sort_order,
                        created_at,
                        updated_at,
                    ],
                )?;
            }

            tx.execute_batch(
                "DROP TABLE mcp_connections;
                 ALTER TABLE mcp_connections_new RENAME TO mcp_connections;
                 CREATE INDEX IF NOT EXISTS idx_mcp_connections_order
                     ON mcp_connections(sort_order ASC, created_at ASC);",
            )?;
        }

        tx.execute(
            "INSERT INTO schema_migrations (id, applied_at) VALUES (?1, ?2)",
            params![MCP_SPLIT_CONFIG_MIGRATION_ID, now_datetime()],
        )?;
        Ok(())
    })
}

pub(crate) fn init_mcp_storage(db: &Database) -> AppResult<()> {
    db.migrate(MCP_MIGRATIONS)?;
    migrate_split_config_columns(db)
}

fn query_raw_connections(conn: &Connection) -> rusqlite::Result<Vec<RawConnectionRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, transport,
                command, args, cwd, env, env_vars,
                url, headers, env_http_headers, bearer_token_env_var
         FROM mcp_connections
         ORDER BY sort_order ASC, created_at ASC",
    )?;
    let mapped = stmt.query_map([], |row| {
        Ok(RawConnectionRow {
            id: row.get(0)?,
            name: row.get(1)?,
            transport: row.get(2)?,
            command: row.get(3)?,
            args: row.get(4)?,
            cwd: row.get(5)?,
            env: row.get(6)?,
            env_vars: row.get(7)?,
            url: row.get(8)?,
            headers: row.get(9)?,
            env_http_headers: row.get(10)?,
            bearer_token_env_var: row.get(11)?,
        })
    })?;
    mapped.collect::<rusqlite::Result<Vec<_>>>()
}

fn decode_connections(rows: Vec<RawConnectionRow>) -> AppResult<Vec<StoredConnection>> {
    let mut connections = Vec::with_capacity(rows.len());
    for row in rows {
        let id = row.id.clone();
        let name = row.name.clone();
        let config = columns_to_config(row)?;
        connections.push(StoredConnection { id, name, config });
    }
    Ok(connections)
}

fn prepare_save_items(
    connections: &mut Vec<StoredConnection>,
) -> AppResult<Vec<(String, String, McpColumns, i64)>> {
    for item in connections.iter_mut() {
        if item.id.trim().is_empty() {
            item.id = next_id_string();
        }
    }
    validate(connections)?;

    let mut prepared = Vec::with_capacity(connections.len());
    for (idx, item) in connections.iter().enumerate() {
        let cols = config_to_columns(&item.config).map_err(|err| {
            AppError::internal(format!("Could not encode the MCP configuration: {err}"))
        })?;
        prepared.push((item.id.clone(), item.name.clone(), cols, idx as i64));
    }
    Ok(prepared)
}

fn apply_save_tx(
    tx: &Transaction<'_>,
    prepared: Vec<(String, String, McpColumns, i64)>,
) -> rusqlite::Result<()> {
    let now = now_datetime();
    let mut created_map: HashMap<String, String> = HashMap::new();
    {
        let mut stmt = tx.prepare("SELECT id, created_at FROM mcp_connections")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
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

    for (id, name, cols, sort_order) in prepared {
        let created_at = created_map.get(&id).cloned().unwrap_or_else(|| now.clone());
        tx.execute(
            "INSERT INTO mcp_connections (
                id, name, transport,
                command, args, cwd, env, env_vars,
                url, headers, env_http_headers, bearer_token_env_var,
                sort_order, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                transport = excluded.transport,
                command = excluded.command,
                args = excluded.args,
                cwd = excluded.cwd,
                env = excluded.env,
                env_vars = excluded.env_vars,
                url = excluded.url,
                headers = excluded.headers,
                env_http_headers = excluded.env_http_headers,
                bearer_token_env_var = excluded.bearer_token_env_var,
                sort_order = excluded.sort_order,
                updated_at = excluded.updated_at",
            params![
                id,
                name,
                cols.transport,
                cols.command,
                cols.args,
                cols.cwd,
                cols.env,
                cols.env_vars,
                cols.url,
                cols.headers,
                cols.env_http_headers,
                cols.bearer_token_env_var,
                sort_order,
                created_at,
                now,
            ],
        )?;
    }
    Ok(())
}

pub(crate) async fn load_stored_connections(db: &Database) -> AppResult<Vec<StoredConnection>> {
    let rows = db.run_blocking(query_raw_connections).await?;
    decode_connections(rows)
}

pub(crate) async fn save_stored_connections(
    db: &Database,
    mut connections: Vec<StoredConnection>,
) -> AppResult<Vec<StoredConnection>> {
    let prepared = prepare_save_items(&mut connections)?;
    db.run_transaction(move |tx| apply_save_tx(tx, prepared))
        .await?;
    Ok(connections)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_sync(db: &Database) -> Vec<StoredConnection> {
        let rows = db.with_conn(query_raw_connections).unwrap();
        decode_connections(rows).unwrap()
    }

    fn save_sync(db: &Database, mut connections: Vec<StoredConnection>) -> Vec<StoredConnection> {
        let prepared = prepare_save_items(&mut connections).unwrap();
        db.transaction(|tx| apply_save_tx(tx, prepared)).unwrap();
        connections
    }

    fn table_columns(db: &Database) -> Vec<String> {
        db.with_conn(table_columns_conn).unwrap()
    }

    #[test]
    fn save_and_load_split_columns() {
        let db = Database::open_in_memory().unwrap();
        init_mcp_storage(&db).unwrap();

        let cols = table_columns(&db);
        assert!(!cols.iter().any(|col| col == "config_json"));
        for expected in [
            "id",
            "name",
            "transport",
            "command",
            "args",
            "cwd",
            "env",
            "env_vars",
            "url",
            "headers",
            "env_http_headers",
            "bearer_token_env_var",
            "sort_order",
            "created_at",
            "updated_at",
        ] {
            assert!(cols.iter().any(|col| col == expected));
        }

        let initial = vec![
            StoredConnection {
                id: "mcp_stdio_full".to_string(),
                name: "Local Filesystem".to_string(),
                config: McpConfig::Stdio {
                    command: "npx".to_string(),
                    args: vec![
                        "-y".to_string(),
                        "@modelcontextprotocol/server-filesystem".to_string(),
                    ],
                    env: HashMap::from([
                        ("NODE_ENV".to_string(), "production".to_string()),
                        ("DEBUG".to_string(), "1".to_string()),
                    ]),
                    env_vars: vec!["HOME".to_string(), "PATH".to_string()],
                    cwd: Some("D:\\workspace".to_string()),
                },
            },
            StoredConnection {
                id: "mcp_stdio_empty".to_string(),
                name: "Minimal Stdio".to_string(),
                config: McpConfig::Stdio {
                    command: "uvx".to_string(),
                    args: Vec::new(),
                    env: HashMap::new(),
                    env_vars: Vec::new(),
                    cwd: None,
                },
            },
            StoredConnection {
                id: "mcp_http_full".to_string(),
                name: "Remote HTTP".to_string(),
                config: McpConfig::Http(HttpConfig {
                    url: "https://example.com/mcp".to_string(),
                    headers: HashMap::from([("X-Client".to_string(), "open-tools".to_string())]),
                    env_http_headers: HashMap::from([(
                        "X-Api-Key".to_string(),
                        "MY_MCP_API_KEY".to_string(),
                    )]),
                    bearer_token_env_var: Some("MY_BEARER_TOKEN".to_string()),
                }),
            },
        ];

        save_sync(&db, initial);

        // 核对底层列值：跨传输字段与空集合字段均为 NULL
        db.with_conn(|conn| {
            let stdio_row = conn.query_row(
                "SELECT transport, command, args, cwd, env, env_vars, url, headers, env_http_headers, bearer_token_env_var, created_at
                 FROM mcp_connections WHERE id = 'mcp_stdio_full'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, Option<String>>(9)?,
                        row.get::<_, String>(10)?,
                    ))
                },
            )?;
            assert_eq!(stdio_row.0, "stdio");
            assert_eq!(stdio_row.1.as_deref(), Some("npx"));
            assert_eq!(
                stdio_row.2.as_deref(),
                Some("[\"-y\",\"@modelcontextprotocol/server-filesystem\"]")
            );
            assert_eq!(stdio_row.3.as_deref(), Some("D:\\workspace"));
            assert_eq!(
                stdio_row.4.as_deref(),
                Some("{\"DEBUG\":\"1\",\"NODE_ENV\":\"production\"}")
            );
            assert_eq!(stdio_row.5.as_deref(), Some("[\"HOME\",\"PATH\"]"));
            assert!(stdio_row.6.is_none());
            assert!(stdio_row.7.is_none());
            assert!(stdio_row.8.is_none());
            assert!(stdio_row.9.is_none());

            let empty_row = conn.query_row(
                "SELECT args, env, env_vars FROM mcp_connections WHERE id = 'mcp_stdio_empty'",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                },
            )?;
            assert!(empty_row.0.is_none());
            assert!(empty_row.1.is_none());
            assert!(empty_row.2.is_none());

            let http_row = conn.query_row(
                "SELECT transport, command, args, cwd, env, env_vars, url, headers, env_http_headers, bearer_token_env_var
                 FROM mcp_connections WHERE id = 'mcp_http_full'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, Option<String>>(9)?,
                    ))
                },
            )?;
            assert_eq!(http_row.0, "streaming_http");
            assert!(http_row.1.is_none());
            assert!(http_row.2.is_none());
            assert!(http_row.3.is_none());
            assert!(http_row.4.is_none());
            assert!(http_row.5.is_none());
            assert_eq!(http_row.6.as_deref(), Some("https://example.com/mcp"));
            assert_eq!(
                http_row.7.as_deref(),
                Some("{\"X-Client\":\"open-tools\"}")
            );
            assert_eq!(
                http_row.8.as_deref(),
                Some("{\"X-Api-Key\":\"MY_MCP_API_KEY\"}")
            );
            assert_eq!(http_row.9.as_deref(), Some("MY_BEARER_TOKEN"));
            Ok(())
        })
        .unwrap();

        let loaded = load_sync(&db);
        assert_eq!(loaded.len(), 3);
        assert_eq!(loaded[0].name, "Local Filesystem");
        assert_eq!(loaded[1].name, "Minimal Stdio");
        assert_eq!(loaded[2].name, "Remote HTTP");

        let old_created_at: String = db
            .with_conn(|conn| {
                conn.query_row(
                    "SELECT created_at FROM mcp_connections WHERE id = 'mcp_stdio_full'",
                    [],
                    |row| row.get(0),
                )
            })
            .unwrap();

        // 同一 ID 切换 transport 并删除其他项：旧 stdio 列需置 NULL，且保留原 created_at
        save_sync(
            &db,
            vec![StoredConnection {
                id: "mcp_stdio_full".to_string(),
                name: "Switched To HTTP".to_string(),
                config: McpConfig::Http(HttpConfig {
                    url: "https://switched.example/mcp".to_string(),
                    headers: HashMap::new(),
                    env_http_headers: HashMap::new(),
                    bearer_token_env_var: None,
                }),
            }],
        );

        let after = load_sync(&db);
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].id, "mcp_stdio_full");
        assert_eq!(after[0].name, "Switched To HTTP");
        match &after[0].config {
            McpConfig::Http(http) => {
                assert_eq!(http.url, "https://switched.example/mcp");
                assert!(http.headers.is_empty());
                assert!(http.env_http_headers.is_empty());
                assert!(http.bearer_token_env_var.is_none());
            }
            McpConfig::Stdio { .. } => panic!("Expected streaming_http config"),
        }

        db.with_conn(|conn| {
            let (cmd, args, cwd, env, env_vars, created_at) = conn.query_row(
                "SELECT command, args, cwd, env, env_vars, created_at FROM mcp_connections WHERE id = 'mcp_stdio_full'",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )?;
            assert!(cmd.is_none());
            assert!(args.is_none());
            assert!(cwd.is_none());
            assert!(env.is_none());
            assert!(env_vars.is_none());
            assert_eq!(created_at, old_created_at);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn migrates_legacy_config_json_losslessly() {
        let db = Database::open_in_memory().unwrap();
        db.migrate(MCP_MIGRATIONS).unwrap();

        let legacy_stdio = serde_json::to_string(&McpConfig::Stdio {
            command: "node".to_string(),
            args: vec!["server.js".to_string()],
            env: HashMap::from([("PORT".to_string(), "3000".to_string())]),
            env_vars: vec!["PATH".to_string()],
            cwd: Some("C:\\mcp".to_string()),
        })
        .unwrap();
        let legacy_http = serde_json::to_string(&McpConfig::Http(HttpConfig {
            url: "https://api.example.com/mcp".to_string(),
            headers: HashMap::from([("Authorization".to_string(), "Bearer abc".to_string())]),
            env_http_headers: HashMap::from([("X-Env".to_string(), "ENV_VAL".to_string())]),
            bearer_token_env_var: Some("API_TOKEN".to_string()),
        }))
        .unwrap();

        db.transaction(|tx| {
            tx.execute(
                "INSERT INTO mcp_connections (id, name, transport, config_json, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    "legacy-1",
                    "Legacy Stdio",
                    "stdio",
                    legacy_stdio,
                    2_i64,
                    "2026-01-01 08:00:00",
                    "2026-01-02 09:00:00"
                ],
            )?;
            tx.execute(
                "INSERT INTO mcp_connections (id, name, transport, config_json, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    "legacy-2",
                    "Legacy HTTP",
                    "streaming_http",
                    legacy_http,
                    1_i64,
                    "2026-01-03 10:00:00",
                    "2026-01-04 11:00:00"
                ],
            )?;
            Ok(())
        })
        .unwrap();

        init_mcp_storage(&db).unwrap();
        // 再次调用应保持幂等
        init_mcp_storage(&db).unwrap();

        let cols = table_columns(&db);
        assert!(!cols.iter().any(|col| col == "config_json"));

        let loaded = load_sync(&db);
        assert_eq!(loaded.len(), 2);
        // sort_order: 1 在 2 之前
        assert_eq!(loaded[0].id, "legacy-2");
        assert_eq!(loaded[0].name, "Legacy HTTP");
        match &loaded[0].config {
            McpConfig::Http(http) => {
                assert_eq!(http.url, "https://api.example.com/mcp");
                assert_eq!(http.headers.get("Authorization").map(String::as_str), Some("Bearer abc"));
                assert_eq!(http.env_http_headers.get("X-Env").map(String::as_str), Some("ENV_VAL"));
                assert_eq!(http.bearer_token_env_var.as_deref(), Some("API_TOKEN"));
            }
            McpConfig::Stdio { .. } => panic!("Expected streaming_http config"),
        }

        assert_eq!(loaded[1].id, "legacy-1");
        assert_eq!(loaded[1].name, "Legacy Stdio");
        match &loaded[1].config {
            McpConfig::Stdio {
                command,
                args,
                env,
                env_vars,
                cwd,
            } => {
                assert_eq!(command, "node");
                assert_eq!(args, &vec!["server.js".to_string()]);
                assert_eq!(env.get("PORT").map(String::as_str), Some("3000"));
                assert_eq!(env_vars, &vec!["PATH".to_string()]);
                assert_eq!(cwd.as_deref(), Some("C:\\mcp"));
            }
            McpConfig::Http(_) => panic!("Expected stdio config"),
        }

        db.with_conn(|conn| {
            let meta = conn.query_row(
                "SELECT sort_order, created_at, updated_at FROM mcp_connections WHERE id = 'legacy-1'",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )?;
            assert_eq!(meta, (2, "2026-01-01 08:00:00".to_string(), "2026-01-02 09:00:00".to_string()));
            Ok(())
        })
        .unwrap();
    }
}
