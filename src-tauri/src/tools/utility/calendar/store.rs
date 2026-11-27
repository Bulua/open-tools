//! 日历备注 SQLite 持久化层（`calendar_notes`）。

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::core::db::{now_datetime, Database, Migration};
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

const CALENDAR_MIGRATIONS: &[Migration] = &[Migration {
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
}];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CalendarNoteDto {
    pub(crate) id: String,
    pub(crate) date: String,
    pub(crate) text: String,
    pub(crate) annual: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reminder_time: Option<String>,
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
    pub(crate) reminder_time: Option<String>,
}

fn validate_note_date(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    let b = trimmed.as_bytes();
    let valid = b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter()
            .enumerate()
            .all(|(i, ch)| matches!(i, 4 | 7) || ch.is_ascii_digit());
    if !valid {
        return Err(AppError::invalid_input("Calendar date must be YYYY-MM-DD."));
    }
    Ok(trimmed.to_string())
}

fn validate_reminder_time(raw: Option<String>) -> AppResult<Option<String>> {
    let Some(text) = raw.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let parts: Vec<&str> = text.split(':').collect();
    if parts.len() != 3 || parts.iter().any(|p| p.len() != 2) {
        return Err(AppError::invalid_input("Reminder time must be HH:MM:SS."));
    }
    let h = parts[0]
        .parse::<u8>()
        .map_err(|_| AppError::invalid_input("Invalid reminder hour."))?;
    let m = parts[1]
        .parse::<u8>()
        .map_err(|_| AppError::invalid_input("Invalid reminder minute."))?;
    let s = parts[2]
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
            "SELECT id, note_date, content, annual, reminder_time, created_at, updated_at
             FROM calendar_notes
             ORDER BY note_date ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CalendarNoteDto {
                id: row.get(0)?,
                date: row.get(1)?,
                text: row.get(2)?,
                annual: row.get::<_, i64>(3)? != 0,
                reminder_time: row.get(4)?,
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
    let reminder_time = validate_reminder_time(input.reminder_time)?;
    let content = input.text;
    let annual = input.annual;

    db.run_transaction(move |tx| {
        let now = now_datetime();
        let new_id = next_id_string();
        tx.execute(
            "INSERT INTO calendar_notes (
                id, note_date, content, annual, reminder_time, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(note_date) DO UPDATE SET
                content = excluded.content,
                annual = excluded.annual,
                reminder_time = excluded.reminder_time,
                updated_at = excluded.updated_at",
            params![
                new_id,
                note_date,
                content,
                if annual { 1i64 } else { 0i64 },
                reminder_time,
                &now,
                &now,
            ],
        )?;
        tx.query_row(
            "SELECT id, note_date, content, annual, reminder_time, created_at, updated_at
             FROM calendar_notes
             WHERE note_date = ?1",
            [&note_date],
            |row| {
                Ok(CalendarNoteDto {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    text: row.get(2)?,
                    annual: row.get::<_, i64>(3)? != 0,
                    reminder_time: row.get(4)?,
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
