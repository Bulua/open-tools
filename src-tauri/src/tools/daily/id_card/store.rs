//! 身份证解析历史记录 SQLite 持久化层（DPAPI 加密号码 + SHA-256 哈希去重）。

use rusqlite::{params, OptionalExtension};

use crate::core::db::{
    now_datetime,
    secret::{decrypt_secret, encrypt_secret, sha256_hex},
    Database, Migration,
};
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

const MAX_HISTORY: i64 = 10;

const ID_CARD_MIGRATIONS: &[Migration] = &[Migration {
    id: "id_card_001_init",
    sql: r#"
        CREATE TABLE IF NOT EXISTS id_card_history (
            id TEXT PRIMARY KEY,
            id_hash TEXT NOT NULL UNIQUE,
            id_number_enc TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_id_card_history_updated
            ON id_card_history(updated_at DESC, id DESC);
    "#,
}];

fn normalize_id_number(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim().to_ascii_uppercase();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("ID card number must not be empty."));
    }
    Ok(trimmed)
}

fn trim_history_conn(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM id_card_history
         WHERE id NOT IN (
             SELECT id FROM id_card_history
             ORDER BY updated_at DESC, id DESC
             LIMIT ?1
         )",
        [MAX_HISTORY],
    )?;
    Ok(())
}

pub(crate) fn init_id_card_storage(db: &Database) -> AppResult<()> {
    db.migrate(ID_CARD_MIGRATIONS)
}

pub(crate) async fn list_history(db: &Database) -> AppResult<Vec<String>> {
    let encrypted = db
        .run_blocking(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id_number_enc
                 FROM id_card_history
                 ORDER BY updated_at DESC, id DESC
                 LIMIT ?1",
            )?;
            let rows = stmt.query_map([MAX_HISTORY], |row| row.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .await?;
    let mut out = Vec::with_capacity(encrypted.len());
    for enc in encrypted {
        out.push(decrypt_secret(&enc)?);
    }
    Ok(out)
}

pub(crate) async fn add_history(db: &Database, id_number: String) -> AppResult<Vec<String>> {
    let normalized = normalize_id_number(&id_number)?;
    let id_hash = sha256_hex(&normalized);
    let id_enc = encrypt_secret(&normalized)?;

    db.run_transaction(move |tx| {
        let now = now_datetime();
        let existing_id: Option<String> = tx
            .query_row(
                "SELECT id FROM id_card_history WHERE id_hash = ?1",
                [&id_hash],
                |row| row.get(0),
            )
            .optional()?;
        if existing_id.is_some() {
            // 更新为最新雪花 ID 与时间戳，确保同一秒内再次查询也能排到最前面。
            tx.execute("DELETE FROM id_card_history WHERE id_hash = ?1", [&id_hash])?;
        }
        tx.execute(
            "INSERT INTO id_card_history (id, id_hash, id_number_enc, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![next_id_string(), id_hash, id_enc, &now, &now],
        )?;
        trim_history_conn(tx)?;
        Ok(())
    })
    .await?;

    list_history(db).await
}

pub(crate) async fn import_history(
    db: &Database,
    id_numbers: Vec<String>,
) -> AppResult<Vec<String>> {
    let mut prepared = Vec::new();
    for raw in id_numbers.into_iter().take(MAX_HISTORY as usize) {
        if let Ok(normalized) = normalize_id_number(&raw) {
            let hash = sha256_hex(&normalized);
            let enc = encrypt_secret(&normalized)?;
            prepared.push((hash, enc));
        }
    }

    db.run_transaction(move |tx| {
        let count: i64 =
            tx.query_row("SELECT COUNT(1) FROM id_card_history", [], |row| row.get(0))?;
        if count == 0 {
            let now = now_datetime();
            for (hash, enc) in prepared.into_iter().rev() {
                tx.execute(
                    "INSERT OR IGNORE INTO id_card_history (id, id_hash, id_number_enc, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![next_id_string(), hash, enc, &now, &now],
                )?;
            }
            trim_history_conn(tx)?;
        }
        Ok(())
    })
    .await?;

    list_history(db).await
}

pub(crate) async fn delete_history(db: &Database, id_number: String) -> AppResult<Vec<String>> {
    let normalized = normalize_id_number(&id_number)?;
    let id_hash = sha256_hex(&normalized);
    db.run_transaction(move |tx| {
        tx.execute("DELETE FROM id_card_history WHERE id_hash = ?1", [&id_hash])?;
        Ok(())
    })
    .await?;
    list_history(db).await
}

pub(crate) async fn clear_history(db: &Database) -> AppResult<()> {
    db.run_transaction(|tx| {
        tx.execute("DELETE FROM id_card_history", [])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn encrypts_dedups_and_trims_id_card_history() {
        let db = Database::open_in_memory().unwrap();
        init_id_card_storage(&db).unwrap();

        let imported = import_history(
            &db,
            vec![
                "11010519491231002x".into(),
                "110105199001011234".into(),
            ],
        )
        .await
        .unwrap();
        assert_eq!(imported, vec!["11010519491231002X", "110105199001011234"]);

        let stored_raw: String = db
            .with_conn(|conn| {
                conn.query_row(
                    "SELECT id_number_enc FROM id_card_history LIMIT 1",
                    [],
                    |row| row.get(0),
                )
            })
            .unwrap();
        #[cfg(windows)]
        assert!(stored_raw.starts_with("dpapi:"));

        let after_dup = add_history(&db, "110105199001011234".into()).await.unwrap();
        assert_eq!(after_dup[0], "110105199001011234");
        assert_eq!(after_dup.len(), 2);

        let after_del = delete_history(&db, "110105199001011234".into())
            .await
            .unwrap();
        assert_eq!(after_del, vec!["11010519491231002X"]);

        clear_history(&db).await.unwrap();
        assert!(list_history(&db).await.unwrap().is_empty());
    }
}
