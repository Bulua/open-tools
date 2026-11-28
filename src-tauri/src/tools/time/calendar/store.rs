//! 日历备注 SQLite 持久化层（`calendar_notes`）。

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::core::db::{now_datetime, Database, Migration};
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

const CALENDAR_MIGRATIONS: &[Migration] = &[
    Migration {
        id: "calendar_001_init",
        sql: r#"
            CREATE TABLE IF NOT EXISTS calendar_notes (
                id TEXT PRIMARY KEY,
                note_date TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                annual INTEGER NOT NULL DEFAULT 0,
                reminder_time TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_calendar_notes_date
                ON calendar_notes(note_date ASC);
        "#,
    },
    Migration {
        id: "calendar_002_reminder_at",
        sql: r#"
            ALTER TABLE calendar_notes ADD COLUMN reminder_at TEXT;

            UPDATE calendar_notes
            SET reminder_at = note_date || ' ' || reminder_time
            WHERE reminder_at IS NULL
              AND reminder_time IS NOT NULL
              AND length(trim(reminder_time)) = 8;
        "#,
    },
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CalendarNoteDto {
    pub(crate) id: String,
    pub(crate) date: String,
    pub(crate) text: String,
    pub(crate) annual: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reminder_at: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CalendarNoteUpsertInput {
    pub(crate) date: String,
    pub(crate) text: String,
    #[serde(default)]
    pub(crate) annual: bool,
    #[serde(default)]
    pub(crate) reminder_at: Option<String>,
}

fn is_valid_ymd(y: u32, m: u32, d: u32) -> bool {
    if !(1..=12).contains(&m) || d == 0 {
        return false;
    }
    let max_day = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
            if leap { 29 } else { 28 }
        }
        _ => return false,
    };
    d <= max_day
}

fn parse_ymd(date_str: &str) -> Option<(u32, u32, u32)> {
    let b = date_str.as_bytes();
    if b.len() != 10
        || b[4] != b'-'
        || b[7] != b'-'
        || !b
            .iter()
            .enumerate()
            .all(|(i, ch)| matches!(i, 4 | 7) || ch.is_ascii_digit())
    {
        return None;
    }
    let y = date_str[0..4].parse::<u32>().ok()?;
    let m = date_str[5..7].parse::<u32>().ok()?;
    let d = date_str[8..10].parse::<u32>().ok()?;
    if !is_valid_ymd(y, m, d) {
        return None;
    }
    Some((y, m, d))
}

fn validate_note_date(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if parse_ymd(trimmed).is_none() {
        return Err(AppError::invalid_input("Calendar date must be YYYY-MM-DD."));
    }
    Ok(trimmed.to_string())
}

fn validate_reminder_at(raw: Option<String>) -> AppResult<Option<String>> {
    let Some(text) = raw.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let b = text.as_bytes();
    if b.len() != 19
        || b[10] != b' '
        || b[13] != b':'
        || b[16] != b':'
        || !b[11..19]
            .iter()
            .enumerate()
            .all(|(i, ch)| matches!(i, 2 | 5) || ch.is_ascii_digit())
    {
        return Err(AppError::invalid_input(
            "Reminder datetime must be YYYY-MM-DD HH:MM:SS.",
        ));
    }
    if parse_ymd(&text[0..10]).is_none() {
        return Err(AppError::invalid_input("Invalid reminder date."));
    }
    let h = text[11..13]
        .parse::<u8>()
        .map_err(|_| AppError::invalid_input("Invalid reminder hour."))?;
    let m = text[14..16]
        .parse::<u8>()
        .map_err(|_| AppError::invalid_input("Invalid reminder minute."))?;
    let s = text[17..19]
        .parse::<u8>()
        .map_err(|_| AppError::invalid_input("Invalid reminder second."))?;
    if h > 23 || m > 59 || s > 59 {
        return Err(AppError::invalid_input("Reminder time out of range."));
    }
    Ok(Some(text))
}

pub(crate) fn init_calendar_storage(db: &Database) -> AppResult<()> {
    db.migrate(CALENDAR_MIGRATIONS)
}

pub(super) async fn list_notes(db: &Database) -> AppResult<Vec<CalendarNoteDto>> {
    db.run_blocking(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, note_date, content, annual, reminder_at, created_at, updated_at
             FROM calendar_notes
             ORDER BY note_date ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CalendarNoteDto {
                id: row.get(0)?,
                date: row.get(1)?,
                text: row.get(2)?,
                annual: row.get::<_, i64>(3)? != 0,
                reminder_at: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        rows.collect()
    })
    .await
}

pub(super) async fn upsert_note(
    db: &Database,
    input: CalendarNoteUpsertInput,
) -> AppResult<CalendarNoteDto> {
    let note_date = validate_note_date(&input.date)?;
    let reminder_at = validate_reminder_at(input.reminder_at)?;
    let content = input.text;
    let annual = input.annual;

    db.run_transaction(move |tx| {
        let now = now_datetime();
        let new_id = next_id_string();
        tx.execute(
            "INSERT INTO calendar_notes (
                id, note_date, content, annual, reminder_at, reminder_time, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7)
             ON CONFLICT(note_date) DO UPDATE SET
                content = excluded.content,
                annual = excluded.annual,
                reminder_at = excluded.reminder_at,
                reminder_time = NULL,
                updated_at = excluded.updated_at",
            params![
                new_id,
                note_date,
                content,
                if annual { 1i64 } else { 0i64 },
                reminder_at,
                &now,
                &now,
            ],
        )?;
        tx.query_row(
            "SELECT id, note_date, content, annual, reminder_at, created_at, updated_at
             FROM calendar_notes
             WHERE note_date = ?1",
            [&note_date],
            |row| {
                Ok(CalendarNoteDto {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    text: row.get(2)?,
                    annual: row.get::<_, i64>(3)? != 0,
                    reminder_at: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )
    })
    .await
}

pub(super) async fn delete_note(db: &Database, date: String) -> AppResult<()> {
    let note_date = validate_note_date(&date)?;
    db.run_transaction(move |tx| {
        tx.execute("DELETE FROM calendar_notes WHERE note_date = ?1", [&note_date])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_reminder_at_formats() {
        assert_eq!(validate_reminder_at(None).unwrap(), None);
        assert_eq!(validate_reminder_at(Some("   ".into())).unwrap(), None);
        assert_eq!(
            validate_reminder_at(Some("2024-02-29 08:30:00".into())).unwrap(),
            Some("2024-02-29 08:30:00".into())
        );
        assert!(validate_reminder_at(Some("09:00:00".into())).is_err());
        assert!(validate_reminder_at(Some("2025-02-29 09:00:00".into())).is_err());
        assert!(validate_reminder_at(Some("2026-05-01T09:00:00".into())).is_err());
        assert!(validate_reminder_at(Some("2026-05-01 25:00:00".into())).is_err());
    }

    #[test]
    fn migrates_legacy_reminder_time_to_reminder_at() {
        let dir = std::env::temp_dir().join(format!("open-tools-cal-test-{}", next_id_string()));
        let db_path = dir.join("calendar.db");
        let db = Database::open(&db_path).expect("open db");

        // 先只应用 001 迁移并写入旧格式 reminder_time
        db.migrate(&CALENDAR_MIGRATIONS[..1]).expect("migrate 001");
        db.transaction(|tx| {
            tx.execute(
                "INSERT INTO calendar_notes (id, note_date, content, annual, reminder_time, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    "100",
                    "2026-05-10",
                    "妈妈生日",
                    1i64,
                    "09:30:00",
                    "2026-05-01 10:00:00",
                    "2026-05-01 10:00:00",
                ],
            )?;
            Ok(())
        })
        .expect("insert legacy row");

        // 再应用完整迁移（含 002）
        init_calendar_storage(&db).expect("migrate 002");

        let migrated: Option<String> = db
            .with_conn(|conn| {
                conn.query_row(
                    "SELECT reminder_at FROM calendar_notes WHERE id = '100'",
                    [],
                    |row| row.get(0),
                )
            })
            .expect("query migrated row");
        assert_eq!(migrated.as_deref(), Some("2026-05-10 09:30:00"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
