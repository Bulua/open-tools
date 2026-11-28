//! HTTP 请求历史 SQLite 持久化层（无 JSON 关系表，敏感凭据与 Header 独立 DPAPI 加密）。

use std::collections::HashMap;

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::core::db::{
    normalize_datetime,
    secret::{decrypt_secret, encrypt_secret},
    Database, Migration,
};
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

const MAX_HISTORY: i64 = 50;

const HTTP_MIGRATIONS: &[Migration] = &[Migration {
    id: "http_client_001_init",
    sql: r#"
        CREATE TABLE IF NOT EXISTS http_history (
            id TEXT PRIMARY KEY,
            method TEXT NOT NULL,
            url TEXT NOT NULL,
            status INTEGER,
            auth_type TEXT NOT NULL DEFAULT 'none',
            auth_token_enc TEXT NOT NULL DEFAULT '',
            auth_username TEXT NOT NULL DEFAULT '',
            auth_password_enc TEXT NOT NULL DEFAULT '',
            body_type TEXT NOT NULL DEFAULT 'none',
            body_text TEXT NOT NULL DEFAULT '',
            text_type TEXT NOT NULL DEFAULT 'text/plain',
            timeout INTEGER NOT NULL DEFAULT 30,
            follow_redirects INTEGER NOT NULL DEFAULT 1,
            insecure INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_http_history_method_url
            ON http_history(method, url);

        CREATE INDEX IF NOT EXISTS idx_http_history_updated
            ON http_history(updated_at DESC, id DESC);

        CREATE TABLE IF NOT EXISTS http_history_items (
            id TEXT PRIMARY KEY,
            history_id TEXT NOT NULL REFERENCES http_history(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            item_key TEXT NOT NULL,
            item_value TEXT NOT NULL DEFAULT '',
            is_encrypted INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_http_history_items_lookup
            ON http_history_items(history_id, kind, sort_order ASC);
    "#,
}];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HttpKeyValue {
    pub(crate) enabled: bool,
    pub(crate) key: String,
    pub(crate) value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HttpAuth {
    #[serde(rename = "type")]
    pub(crate) kind: String,
    pub(crate) token: String,
    pub(crate) username: String,
    pub(crate) password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HttpRequestSnapshot {
    pub(crate) method: String,
    pub(crate) url: String,
    pub(crate) params: Vec<HttpKeyValue>,
    pub(crate) headers: Vec<HttpKeyValue>,
    pub(crate) auth: HttpAuth,
    pub(crate) body_type: String,
    pub(crate) body_text: String,
    pub(crate) text_type: String,
    pub(crate) form: Vec<HttpKeyValue>,
    pub(crate) multipart: Vec<HttpKeyValue>,
    pub(crate) timeout: i64,
    pub(crate) follow_redirects: bool,
    pub(crate) insecure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HttpHistoryRecord {
    pub(crate) id: String,
    pub(crate) time: String,
    pub(crate) status: Option<i64>,
    pub(crate) request: HttpRequestSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HttpHistorySaveInput {
    pub(crate) status: Option<i64>,
    pub(crate) request: HttpRequestSnapshot,
    pub(crate) updated_at: Option<String>,
}

fn is_sensitive_header(key: &str) -> bool {
    let lower = key.trim().to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "authorization" | "proxy-authorization" | "cookie" | "set-cookie"
    ) || lower.contains("token")
        || lower.contains("secret")
        || lower.contains("api-key")
        || lower.contains("apikey")
        || lower.contains("password")
        || lower.contains("passwd")
}

struct PreparedItems {
    kind: &'static str,
    enabled: i64,
    key: String,
    value: String,
    is_encrypted: i64,
    sort_order: i64,
}

struct PreparedHistory {
    method: String,
    url: String,
    status: Option<i64>,
    auth_type: String,
    auth_token_enc: String,
    auth_username: String,
    auth_password_enc: String,
    body_type: String,
    body_text: String,
    text_type: String,
    timeout: i64,
    follow_redirects: i64,
    insecure: i64,
    updated_at: String,
    items: Vec<PreparedItems>,
}

fn prepare_history(input: HttpHistorySaveInput) -> AppResult<PreparedHistory> {
    let method = input.request.method.trim().to_ascii_uppercase();
    if method.is_empty() {
        return Err(AppError::invalid_input("HTTP method must not be empty."));
    }
    let auth_token_enc = encrypt_secret(&input.request.auth.token)?;
    let auth_password_enc = encrypt_secret(&input.request.auth.password)?;

    let mut items = Vec::new();
    let kinds: [(&'static str, &[HttpKeyValue]); 4] = [
        ("param", &input.request.params),
        ("header", &input.request.headers),
        ("form", &input.request.form),
        ("multipart", &input.request.multipart),
    ];
    for (kind, list) in kinds {
        for (idx, row) in list.iter().enumerate() {
            let (value, is_encrypted) = if kind == "header"
                && !row.value.is_empty()
                && is_sensitive_header(&row.key)
            {
                (encrypt_secret(&row.value)?, 1)
            } else {
                (row.value.clone(), 0)
            };
            items.push(PreparedItems {
                kind,
                enabled: if row.enabled { 1 } else { 0 },
                key: row.key.clone(),
                value,
                is_encrypted,
                sort_order: idx as i64,
            });
        }
    }

    Ok(PreparedHistory {
        method,
        url: input.request.url,
        status: input.status,
        auth_type: input.request.auth.kind,
        auth_token_enc,
        auth_username: input.request.auth.username,
        auth_password_enc,
        body_type: input.request.body_type,
        body_text: input.request.body_text,
        text_type: input.request.text_type,
        timeout: input.request.timeout,
        follow_redirects: if input.request.follow_redirects { 1 } else { 0 },
        insecure: if input.request.insecure { 1 } else { 0 },
        updated_at: normalize_datetime(input.updated_at.as_deref()),
        items,
    })
}

fn upsert_history_tx(tx: &rusqlite::Transaction<'_>, p: PreparedHistory) -> rusqlite::Result<()> {
    let existing_id: Option<String> = tx
        .query_row(
            "SELECT id FROM http_history WHERE method = ?1 AND url = ?2",
            params![p.method, p.url],
            |row| row.get(0),
        )
        .optional()?;

    let history_id = if let Some(id) = existing_id {
        tx.execute(
            "UPDATE http_history
             SET status = ?1,
                 auth_type = ?2,
                 auth_token_enc = ?3,
                 auth_username = ?4,
                 auth_password_enc = ?5,
                 body_type = ?6,
                 body_text = ?7,
                 text_type = ?8,
                 timeout = ?9,
                 follow_redirects = ?10,
                 insecure = ?11,
                 updated_at = ?12
             WHERE id = ?13",
            params![
                p.status,
                p.auth_type,
                p.auth_token_enc,
                p.auth_username,
                p.auth_password_enc,
                p.body_type,
                p.body_text,
                p.text_type,
                p.timeout,
                p.follow_redirects,
                p.insecure,
                p.updated_at,
                id,
            ],
        )?;
        tx.execute(
            "DELETE FROM http_history_items WHERE history_id = ?1",
            [&id],
        )?;
        id
    } else {
        let id = next_id_string();
        tx.execute(
            "INSERT INTO http_history (
                id, method, url, status, auth_type, auth_token_enc, auth_username,
                auth_password_enc, body_type, body_text, text_type, timeout,
                follow_redirects, insecure, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                id,
                p.method,
                p.url,
                p.status,
                p.auth_type,
                p.auth_token_enc,
                p.auth_username,
                p.auth_password_enc,
                p.body_type,
                p.body_text,
                p.text_type,
                p.timeout,
                p.follow_redirects,
                p.insecure,
                &p.updated_at,
                &p.updated_at,
            ],
        )?;
        id
    };

    for item in p.items {
        tx.execute(
            "INSERT INTO http_history_items (
                id, history_id, kind, enabled, item_key, item_value, is_encrypted, sort_order
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                next_id_string(),
                &history_id,
                item.kind,
                item.enabled,
                item.key,
                item.value,
                item.is_encrypted,
                item.sort_order,
            ],
        )?;
    }

    tx.execute(
        "DELETE FROM http_history
         WHERE id NOT IN (
             SELECT id FROM http_history
             ORDER BY updated_at DESC, id DESC
             LIMIT ?1
         )",
        [MAX_HISTORY],
    )?;

    Ok(())
}

pub(crate) fn init_http_history_storage(db: &Database) -> AppResult<()> {
    db.migrate(HTTP_MIGRATIONS)
}

pub(crate) async fn list_history(db: &Database) -> AppResult<Vec<HttpHistoryRecord>> {
    let (parents, items) = db
        .run_blocking(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, updated_at, status, method, url, auth_type, auth_token_enc,
                        auth_username, auth_password_enc, body_type, body_text, text_type,
                        timeout, follow_redirects, insecure
                 FROM http_history
                 ORDER BY updated_at DESC, id DESC
                 LIMIT ?1",
            )?;
            let parents = stmt
                .query_map([MAX_HISTORY], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, String>(8)?,
                        row.get::<_, String>(9)?,
                        row.get::<_, String>(10)?,
                        row.get::<_, String>(11)?,
                        row.get::<_, i64>(12)?,
                        row.get::<_, i64>(13)? != 0,
                        row.get::<_, i64>(14)? != 0,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;

            let mut item_stmt = conn.prepare(
                "SELECT history_id, kind, enabled, item_key, item_value, is_encrypted
                 FROM http_history_items
                 ORDER BY sort_order ASC",
            )?;
            let items = item_stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)? != 0,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, i64>(5)? != 0,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok((parents, items))
        })
        .await?;

    let mut by_history: HashMap<String, [Vec<HttpKeyValue>; 4]> = HashMap::new();
    for (history_id, kind, enabled, key, raw_value, is_encrypted) in items {
        let value = if is_encrypted {
            decrypt_secret(&raw_value)?
        } else {
            raw_value
        };
        let slot = match kind.as_str() {
            "param" => 0,
            "header" => 1,
            "form" => 2,
            "multipart" => 3,
            _ => continue,
        };
        by_history
            .entry(history_id)
            .or_insert_with(|| [Vec::new(), Vec::new(), Vec::new(), Vec::new()])[slot]
            .push(HttpKeyValue {
                enabled,
                key,
                value,
            });
    }

    let mut out = Vec::with_capacity(parents.len());
    for (
        id,
        time,
        status,
        method,
        url,
        auth_type,
        auth_token_enc,
        auth_username,
        auth_password_enc,
        body_type,
        body_text,
        text_type,
        timeout,
        follow_redirects,
        insecure,
    ) in parents
    {
        let [params, headers, form, multipart] = by_history
            .remove(&id)
            .unwrap_or_else(|| [Vec::new(), Vec::new(), Vec::new(), Vec::new()]);
        out.push(HttpHistoryRecord {
            id,
            time,
            status,
            request: HttpRequestSnapshot {
                method,
                url,
                params,
                headers,
                auth: HttpAuth {
                    kind: auth_type,
                    token: decrypt_secret(&auth_token_enc)?,
                    username: auth_username,
                    password: decrypt_secret(&auth_password_enc)?,
                },
                body_type,
                body_text,
                text_type,
                form,
                multipart,
                timeout,
                follow_redirects,
                insecure,
            },
        });
    }
    Ok(out)
}

pub(crate) async fn save_history(
    db: &Database,
    input: HttpHistorySaveInput,
) -> AppResult<Vec<HttpHistoryRecord>> {
    let prepared = prepare_history(input)?;
    db.run_transaction(move |tx| upsert_history_tx(tx, prepared))
        .await?;
    list_history(db).await
}

pub(crate) async fn import_history(
    db: &Database,
    entries: Vec<HttpHistorySaveInput>,
) -> AppResult<Vec<HttpHistoryRecord>> {
    let mut prepared_list = Vec::new();
    for entry in entries.into_iter().take(MAX_HISTORY as usize).rev() {
        if let Ok(p) = prepare_history(entry) {
            prepared_list.push(p);
        }
    }
    db.run_transaction(move |tx| {
        let count: i64 = tx.query_row("SELECT COUNT(1) FROM http_history", [], |row| row.get(0))?;
        if count == 0 {
            for p in prepared_list {
                upsert_history_tx(tx, p)?;
            }
        }
        Ok(())
    })
    .await?;
    list_history(db).await
}

pub(crate) async fn delete_history(
    db: &Database,
    id: String,
) -> AppResult<Vec<HttpHistoryRecord>> {
    db.run_transaction(move |tx| {
        tx.execute("DELETE FROM http_history WHERE id = ?1", [id.trim()])?;
        Ok(())
    })
    .await?;
    list_history(db).await
}

pub(crate) async fn clear_history(db: &Database) -> AppResult<()> {
    db.run_transaction(|tx| {
        tx.execute("DELETE FROM http_history", [])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_request(method: &str, url: &str) -> HttpRequestSnapshot {
        HttpRequestSnapshot {
            method: method.into(),
            url: url.into(),
            params: vec![HttpKeyValue {
                enabled: true,
                key: "q".into(),
                value: "test".into(),
            }],
            headers: vec![
                HttpKeyValue {
                    enabled: true,
                    key: "Authorization".into(),
                    value: "Bearer super-secret".into(),
                },
                HttpKeyValue {
                    enabled: true,
                    key: "Accept".into(),
                    value: "application/json".into(),
                },
            ],
            auth: HttpAuth {
                kind: "basic".into(),
                token: String::new(),
                username: "alice".into(),
                password: "pw-123".into(),
            },
            body_type: "json".into(),
            body_text: "{\"a\":1}".into(),
            text_type: "text/plain".into(),
            form: vec![],
            multipart: vec![],
            timeout: 30,
            follow_redirects: true,
            insecure: false,
        }
    }

    #[tokio::test]
    async fn saves_encrypts_dedups_and_deletes_http_history() {
        let db = Database::open_in_memory().unwrap();
        init_http_history_storage(&db).unwrap();

        let list = save_history(
            &db,
            HttpHistorySaveInput {
                status: Some(200),
                request: sample_request("GET", "https://example.com/a"),
                updated_at: Some("2026-11-28 09:00:00".into()),
            },
        )
        .await
        .unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].request.auth.password, "pw-123");
        assert_eq!(list[0].request.headers[0].value, "Bearer super-secret");

        let (pw_enc, hdr_enc): (String, i64) = db
            .with_conn(|conn| {
                let pw: String = conn.query_row(
                    "SELECT auth_password_enc FROM http_history LIMIT 1",
                    [],
                    |r| r.get(0),
                )?;
                let enc: i64 = conn.query_row(
                    "SELECT is_encrypted FROM http_history_items WHERE item_key = 'Authorization'",
                    [],
                    |r| r.get(0),
                )?;
                Ok((pw, enc))
            })
            .unwrap();
        assert_eq!(hdr_enc, 1);
        #[cfg(windows)]
        assert!(pw_enc.starts_with("dpapi:"));

        let updated = save_history(
            &db,
            HttpHistorySaveInput {
                status: Some(201),
                request: sample_request("GET", "https://example.com/a"),
                updated_at: Some("2026-11-28 09:05:00".into()),
            },
        )
        .await
        .unwrap();
        assert_eq!(updated.len(), 1);
        assert_eq!(updated[0].status, Some(201));

        clear_history(&db).await.unwrap();
        assert!(list_history(&db).await.unwrap().is_empty());
    }
}
