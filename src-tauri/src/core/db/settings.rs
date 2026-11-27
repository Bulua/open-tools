//! 全应用通用键值设置表（`app_settings`）读写辅助，按 `scope` 隔离各模块配置。

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use super::now_millis;

pub(crate) fn get_setting_json(
    conn: &Connection,
    scope: &str,
    key: &str,
) -> rusqlite::Result<Option<Value>> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE scope = ?1 AND key = ?2",
            params![scope, key],
            |row| row.get(0),
        )
        .optional()?;
    Ok(raw.and_then(|text| serde_json::from_str(&text).ok()))
}

pub(crate) fn set_setting_json(
    conn: &Connection,
    scope: &str,
    key: &str,
    value: &Value,
) -> rusqlite::Result<()> {
    let text = serde_json::to_string(value).unwrap_or_else(|_| "null".to_string());
    conn.execute(
        "INSERT INTO app_settings (scope, key, value_json, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(scope, key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_at = excluded.updated_at",
        params![scope, key, text, now_millis()],
    )?;
    Ok(())
}
