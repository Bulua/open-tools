//! 时钟统一 SQLite 持久化层（`clock_items`）与本地时间调度计算。
//!
//! 界面命令与 AI 工具共用全应用统一 `core::db::Database` 事务，并在变更后向前端广播 `clock-changed`。

use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::core::db::{normalize_datetime, now_datetime, Database, Migration};
use crate::core::error::AppResult;
use crate::core::id::next_id_string;

pub(crate) const CLOCK_CHANGED_EVENT: &str = "clock-changed";

const CLOCK_MIGRATIONS: &[Migration] = &[Migration {
    id: "clock_001_init",
    sql: r#"
        CREATE TABLE IF NOT EXISTS clock_items (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            default_title INTEGER NOT NULL DEFAULT 0,
            target_ms INTEGER NOT NULL,
            duration_ms INTEGER,
            paused_remaining_ms INTEGER,
            alarm_time TEXT,
            alarm_weekdays_json TEXT,
            repeat TEXT NOT NULL DEFAULT 'none',
            enabled INTEGER NOT NULL DEFAULT 1,
            done INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_clock_items_order
            ON clock_items(sort_order ASC, created_at ASC);
    "#,
}];

fn default_repeat() -> String {
    "none".to_string()
}

/// 闹钟重复规则：`weekdays` 中 0 为星期日、1–6 为星期一至星期六，空数组表示仅提醒一次。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AlarmSchedule {
    pub(super) time: String,
    #[serde(default)]
    pub(super) weekdays: Vec<u8>,
}

/// 与前端 `CountdownItem` 保持字段一致的持久化条目（涵盖闹钟与计时器）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CountdownItem {
    #[serde(default)]
    pub(super) id: String,
    pub(super) title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) default_title: Option<bool>,
    pub(super) target: i64,
    #[serde(default)]
    pub(super) created_at: String,
    #[serde(default)]
    pub(super) updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) duration: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) paused_remaining: Option<i64>,
    #[serde(default = "default_repeat")]
    pub(super) repeat: String,
    #[serde(default)]
    pub(super) done: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) alarm: Option<AlarmSchedule>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) enabled: Option<bool>,
}

impl CountdownItem {
    pub(super) fn is_alarm(&self) -> bool {
        self.alarm.is_some() || self.duration.is_none()
    }

    pub(super) fn is_timer(&self) -> bool {
        self.alarm.is_none() && self.duration.is_some()
    }

    fn kind_str(&self) -> &'static str {
        if self.is_timer() {
            "timer"
        } else {
            "alarm"
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) struct LocalNow {
    pub(super) year: i32,
    pub(super) month: u8,
    pub(super) day: u8,
    pub(super) weekday: u8,
    pub(super) hour: u8,
    pub(super) minute: u8,
    pub(super) second: u8,
    pub(super) utc_ms: i64,
    pub(super) tz_offset_ms: i64,
}

pub(crate) fn init_clock_storage(db: &Database) -> AppResult<()> {
    db.migrate(CLOCK_MIGRATIONS)
}

pub(super) fn now_utc_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn days_from_civil(year: i32, month: u8, day: u8) -> i64 {
    let y = i64::from(year) - i64::from(month <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let m = i64::from(month);
    let d = i64::from(day);
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i32, u8, u8) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = (y + i64::from(m <= 2)) as i32;
    (year, m as u8, d as u8)
}

#[cfg(windows)]
pub(super) fn local_now() -> LocalNow {
    use windows_sys::Win32::Foundation::SYSTEMTIME;
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;

    let mut st = SYSTEMTIME {
        wYear: 0,
        wMonth: 0,
        wDayOfWeek: 0,
        wDay: 0,
        wHour: 0,
        wMinute: 0,
        wSecond: 0,
        wMilliseconds: 0,
    };
    let utc_ms = now_utc_ms();
    // SAFETY: `GetLocalTime` writes the current local system time into `st`.
    unsafe {
        GetLocalTime(&mut st);
    }
    let year = i32::from(st.wYear);
    let month = st.wMonth as u8;
    let day = st.wDay as u8;
    let hour = st.wHour as u8;
    let minute = st.wMinute as u8;
    let second = st.wSecond as u8;
    let local_ms = days_from_civil(year, month, day) * 86_400_000
        + i64::from(hour) * 3_600_000
        + i64::from(minute) * 60_000
        + i64::from(second) * 1_000
        + i64::from(st.wMilliseconds);
    // 四舍五入到整分钟，消除两次系统调用之间的毫秒级偏差。
    let tz_offset_ms = ((local_ms - utc_ms) as f64 / 60_000.0).round() as i64 * 60_000;
    LocalNow {
        year,
        month,
        day,
        weekday: st.wDayOfWeek as u8,
        hour,
        minute,
        second,
        utc_ms,
        tz_offset_ms,
    }
}

#[cfg(not(windows))]
pub(super) fn local_now() -> LocalNow {
    let utc_ms = now_utc_ms();
    let tz_offset_ms = 8 * 3_600_000;
    let local_ms = utc_ms + tz_offset_ms;
    let days = local_ms.div_euclid(86_400_000);
    let rem_ms = local_ms.rem_euclid(86_400_000);
    let (year, month, day) = civil_from_days(days);
    let weekday = (days + 4).rem_euclid(7) as u8;
    let hour = (rem_ms / 3_600_000) as u8;
    let minute = ((rem_ms % 3_600_000) / 60_000) as u8;
    let second = ((rem_ms % 60_000) / 1_000) as u8;
    LocalNow {
        year,
        month,
        day,
        weekday,
        hour,
        minute,
        second,
        utc_ms,
        tz_offset_ms,
    }
}

pub(super) fn format_local_timestamp(utc_ms: i64, tz_offset_ms: i64) -> String {
    let local_ms = utc_ms + tz_offset_ms;
    let days = local_ms.div_euclid(86_400_000);
    let rem_ms = local_ms.rem_euclid(86_400_000);
    let (year, month, day) = civil_from_days(days);
    let hour = rem_ms / 3_600_000;
    let minute = (rem_ms % 3_600_000) / 60_000;
    let second = (rem_ms % 60_000) / 1_000;
    format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}")
}

/// 校验 `HH:MM` 格式并解析为 `(小时, 分钟)`。
pub(super) fn parse_alarm_time(time: &str) -> Result<(u8, u8), String> {
    let parts: Vec<&str> = time.trim().split(':').collect();
    if parts.len() != 2 || parts[0].len() != 2 || parts[1].len() != 2 {
        return Err("Alarm time must be in 24-hour 'HH:MM' format (e.g. '08:30').".to_string());
    }
    let hour = parts[0]
        .parse::<u8>()
        .map_err(|_| "Invalid hour in alarm time.".to_string())?;
    let minute = parts[1]
        .parse::<u8>()
        .map_err(|_| "Invalid minute in alarm time.".to_string())?;
    if hour > 23 || minute > 59 {
        return Err("Alarm time out of range (hour 00-23, minute 00-59).".to_string());
    }
    Ok((hour, minute))
}

/// 按本地日历计算下次闹钟触发的 UTC 毫秒时间戳，与前端 `nextAlarmTarget` 一致。
pub(super) fn next_alarm_target(schedule: &AlarmSchedule) -> Result<i64, String> {
    let (hour, minute) = parse_alarm_time(&schedule.time)?;
    if schedule.weekdays.iter().any(|&d| d > 6) {
        return Err("Weekdays must be integers in 0..=6 (0=Sunday, 1=Monday .. 6=Saturday).".to_string());
    }
    let now = local_now();
    let base_days = days_from_civil(now.year, now.month, now.day);
    for offset in 0..=7_i64 {
        let day_num = base_days + offset;
        let dow = (day_num + 4).rem_euclid(7) as u8;
        let candidate_local_ms = day_num * 86_400_000
            + i64::from(hour) * 3_600_000
            + i64::from(minute) * 60_000;
        let candidate_utc_ms = candidate_local_ms - now.tz_offset_ms;
        if candidate_utc_ms > now.utc_ms
            && (schedule.weekdays.is_empty() || schedule.weekdays.contains(&dow))
        {
            return Ok(candidate_utc_ms);
        }
    }
    Err("Failed to compute next alarm target time.".to_string())
}

fn list_items_conn(conn: &Connection) -> rusqlite::Result<Vec<CountdownItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, title, default_title, target_ms, duration_ms, paused_remaining_ms,
                alarm_time, alarm_weekdays_json, repeat, enabled, done, created_at, updated_at
         FROM clock_items
         ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        let kind: String = row.get(1)?;
        let default_title_raw: i64 = row.get(3)?;
        let duration_ms: Option<i64> = row.get(5)?;
        let alarm_time: Option<String> = row.get(7)?;
        let alarm_weekdays_json: Option<String> = row.get(8)?;
        let enabled_raw: i64 = row.get(10)?;
        let done_raw: i64 = row.get(11)?;

        let alarm = if kind == "alarm" || alarm_time.is_some() {
            let weekdays = alarm_weekdays_json
                .as_deref()
                .and_then(|raw| serde_json::from_str::<Vec<u8>>(raw).ok())
                .unwrap_or_default();
            Some(AlarmSchedule {
                time: alarm_time.unwrap_or_default(),
                weekdays,
            })
        } else {
            None
        };

        let is_timer = alarm.is_none() && duration_ms.is_some();
        Ok(CountdownItem {
            id: row.get(0)?,
            title: row.get(2)?,
            default_title: if is_timer {
                Some(default_title_raw != 0)
            } else {
                None
            },
            target: row.get(4)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
            duration: duration_ms,
            paused_remaining: row.get(6)?,
            repeat: row.get(9)?,
            done: done_raw != 0,
            alarm,
            enabled: if is_timer {
                None
            } else {
                Some(enabled_raw != 0)
            },
        })
    })?;
    rows.collect()
}

fn upsert_item_tx(
    tx: &rusqlite::Transaction<'_>,
    mut item: CountdownItem,
    sort_order: i64,
    now: &str,
) -> rusqlite::Result<()> {
    if item.id.trim().is_empty() {
        item.id = next_id_string();
    }
    let created_at = if item.created_at.trim().is_empty() {
        now.to_string()
    } else {
        normalize_datetime(Some(&item.created_at))
    };
    let kind = item.kind_str();
    let default_title = if item.default_title.unwrap_or(false) {
        1i64
    } else {
        0i64
    };
    let enabled = if item.enabled.unwrap_or(true) {
        1i64
    } else {
        0i64
    };
    let done = if item.done { 1i64 } else { 0i64 };
    let (alarm_time, alarm_weekdays_json) = match &item.alarm {
        Some(schedule) => (
            Some(schedule.time.as_str()),
            Some(
                serde_json::to_string(&schedule.weekdays)
                    .unwrap_or_else(|_| "[]".to_string()),
            ),
        ),
        None => (None, None),
    };

    tx.execute(
        "INSERT INTO clock_items (
            id, kind, title, default_title, target_ms, duration_ms, paused_remaining_ms,
            alarm_time, alarm_weekdays_json, repeat, enabled, done, sort_order,
            created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
         ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            title = excluded.title,
            default_title = excluded.default_title,
            target_ms = excluded.target_ms,
            duration_ms = excluded.duration_ms,
            paused_remaining_ms = excluded.paused_remaining_ms,
            alarm_time = excluded.alarm_time,
            alarm_weekdays_json = excluded.alarm_weekdays_json,
            repeat = excluded.repeat,
            enabled = excluded.enabled,
            done = excluded.done,
            updated_at = excluded.updated_at",
        params![
            item.id.trim(),
            kind,
            item.title,
            default_title,
            item.target,
            item.duration,
            item.paused_remaining,
            alarm_time,
            alarm_weekdays_json,
            item.repeat,
            enabled,
            done,
            sort_order,
            created_at,
            now,
        ],
    )?;
    Ok(())
}

pub(super) fn read_items_sync(db: &Database) -> AppResult<Vec<CountdownItem>> {
    db.with_conn(list_items_conn)
}

pub(super) async fn list_items(db: &Database) -> AppResult<Vec<CountdownItem>> {
    db.run_blocking(list_items_conn).await
}

pub(super) async fn upsert_item(
    db: &Database,
    item: CountdownItem,
) -> AppResult<Vec<CountdownItem>> {
    db.run_transaction(move |tx| {
        let now = now_datetime();
        let next_order: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM clock_items",
            [],
            |row| row.get(0),
        )?;
        upsert_item_tx(tx, item, next_order, &now)?;
        list_items_conn(tx)
    })
    .await
}

pub(super) async fn delete_item(db: &Database, id: String) -> AppResult<Vec<CountdownItem>> {
    let trimmed = id.trim().to_string();
    db.run_transaction(move |tx| {
        if !trimmed.is_empty() {
            tx.execute("DELETE FROM clock_items WHERE id = ?1", [&trimmed])?;
        }
        list_items_conn(tx)
    })
    .await
}

/// 在单次数据库事务内读取、修改并同步写回 `clock_items`，成功后向前端广播 `clock-changed`。
pub(super) fn mutate_items<R>(
    app: &AppHandle,
    mutate: impl FnOnce(&mut Vec<CountdownItem>) -> Result<R, String>,
) -> Result<R, String> {
    let db = app.state::<Database>();
    let outcome = db
        .transaction(|tx| {
            let existing = list_items_conn(tx)?;
            let old_ids: HashSet<String> = existing.iter().map(|i| i.id.clone()).collect();
            let old_created: HashMap<String, String> = existing
                .iter()
                .map(|i| (i.id.clone(), i.created_at.clone()))
                .collect();

            let mut items = existing;
            let res = match mutate(&mut items) {
                Ok(val) => val,
                Err(msg) => return Ok(Err(msg)),
            };

            let keep_ids: HashSet<&str> = items
                .iter()
                .map(|i| i.id.trim())
                .filter(|id| !id.is_empty())
                .collect();
            for old_id in old_ids {
                if !keep_ids.contains(old_id.as_str()) {
                    tx.execute("DELETE FROM clock_items WHERE id = ?1", [&old_id])?;
                }
            }

            let now = now_datetime();
            for (idx, mut item) in items.into_iter().enumerate() {
                if let Some(created) = old_created.get(item.id.trim()) {
                    item.created_at = created.clone();
                }
                upsert_item_tx(tx, item, idx as i64, &now)?;
            }
            Ok(Ok(res))
        })
        .map_err(|e| e.message)?;

    let res = outcome?;
    let _ = app.emit(CLOCK_CHANGED_EVENT, ());
    Ok(res)
}
