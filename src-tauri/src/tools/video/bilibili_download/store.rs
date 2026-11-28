//! B 站视频下载登录凭据（DPAPI 加密）与偏好设置 SQLite 持久化层。

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::core::db::{
    now_datetime,
    secret::{decrypt_secret, encrypt_secret},
    Database, Migration,
};
use crate::core::error::{AppError, AppResult};

const BILIBILI_MIGRATIONS: &[Migration] = &[Migration {
    id: "bilibili_001_init",
    sql: r#"
        CREATE TABLE IF NOT EXISTS bilibili_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            sessdata_enc TEXT NOT NULL DEFAULT '',
            download_quality INTEGER NOT NULL DEFAULT 0,
            codec TEXT NOT NULL DEFAULT 'avc',
            updated_at TEXT NOT NULL
        );
    "#,
}];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BilibiliSettings {
    pub(crate) sessdata: String,
    pub(crate) download_quality: i32,
    pub(crate) codec: String,
}

fn validate_codec(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    match trimmed {
        "avc" | "hevc" | "av1" => Ok(trimmed.to_string()),
        _ => Err(AppError::invalid_input(format!(
            "Unsupported Bilibili codec preference: {trimmed}"
        ))),
    }
}

pub(crate) fn init_bilibili_storage(db: &Database) -> AppResult<()> {
    db.migrate(BILIBILI_MIGRATIONS)
}

pub(crate) async fn get_settings(db: &Database) -> AppResult<Option<BilibiliSettings>> {
    let row = db
        .run_blocking(|conn| {
            conn.query_row(
                "SELECT sessdata_enc, download_quality, codec
                 FROM bilibili_settings
                 WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i32>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()
        })
        .await?;

    let Some((sessdata_enc, download_quality, codec)) = row else {
        return Ok(None);
    };
    let sessdata = decrypt_secret(&sessdata_enc)?;
    Ok(Some(BilibiliSettings {
        sessdata,
        download_quality,
        codec,
    }))
}

pub(crate) async fn save_settings(
    db: &Database,
    settings: BilibiliSettings,
) -> AppResult<BilibiliSettings> {
    let codec = validate_codec(&settings.codec)?;
    let sessdata_trimmed = settings.sessdata.trim().to_string();
    let sessdata_enc = encrypt_secret(&sessdata_trimmed)?;
    let download_quality = settings.download_quality;

    db.run_transaction(move |tx| {
        tx.execute(
            "INSERT INTO bilibili_settings (id, sessdata_enc, download_quality, codec, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
                 sessdata_enc = excluded.sessdata_enc,
                 download_quality = excluded.download_quality,
                 codec = excluded.codec,
                 updated_at = excluded.updated_at",
            params![sessdata_enc, download_quality, codec, now_datetime()],
        )?;
        Ok(())
    })
    .await?;

    Ok(BilibiliSettings {
        sessdata: sessdata_trimmed,
        download_quality,
        codec: validate_codec(&settings.codec)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn saves_and_loads_encrypted_bilibili_settings() {
        let db = Database::open_in_memory().unwrap();
        init_bilibili_storage(&db).unwrap();

        assert!(get_settings(&db).await.unwrap().is_none());

        let saved = save_settings(
            &db,
            BilibiliSettings {
                sessdata: "secret-cookie-value".into(),
                download_quality: 80,
                codec: "hevc".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(saved.sessdata, "secret-cookie-value");

        let stored_enc: String = db
            .with_conn(|conn| {
                conn.query_row(
                    "SELECT sessdata_enc FROM bilibili_settings WHERE id = 1",
                    [],
                    |row| row.get(0),
                )
            })
            .unwrap();
        #[cfg(windows)]
        assert!(stored_enc.starts_with("dpapi:"));

        let loaded = get_settings(&db).await.unwrap().unwrap();
        assert_eq!(loaded, saved);
    }
}
