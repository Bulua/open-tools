//! 时钟统一持久化存取层（`data/countdowns.json`）与本地时间调度计算。
//! 界面命令与 AI 工具共用同一把互斥锁，并在变更后向前端广播 `clock-changed`。

use std::io::Write as _;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub(crate) const CLOCK_CHANGED_EVENT: &str = "clock-changed";

static CLOCK_IO: Mutex<()> = Mutex::new(());
static NEXT_ID_SEQ: AtomicU64 = AtomicU64::new(1);

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

/// 与前端 `CountdownItem` 保持字段完全兼容的持久化条目（涵盖闹钟与计时器）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CountdownItem {
    pub(super) id: String,
    pub(super) title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) default_title: Option<bool>,
    pub(super) target: i64,
    pub(super) created_at: i64,
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

fn countdown_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::core::paths::data_dir(app)?.join("countdowns.json"))
}

fn write_atomic(path: &PathBuf, data: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Missing clock storage directory".to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| format!("Failed to save the countdowns: {e}"))?;
    temp.write_all(data.as_bytes())
        .map_err(|e| format!("Failed to save the countdowns: {e}"))?;
    temp.as_file()
        .sync_all()
        .map_err(|e| format!("Failed to save the countdowns: {e}"))?;
    temp.persist(path)
        .map_err(|e| format!("Failed to save the countdowns: {}", e.error))?;
    Ok(())
}

pub(super) fn generate_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = NEXT_ID_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("clk_{nanos:x}_{seq:x}")
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

pub(super) fn read_snapshot(app: &AppHandle) -> Result<Option<String>, String> {
    let path = countdown_path(app)?;
    let _guard = CLOCK_IO.lock().map_err(|e| e.to_string())?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Failed to read the countdowns: {e}")),
    }
}

pub(super) fn write_snapshot(app: &AppHandle, data: &str) -> Result<(), String> {
    let path = countdown_path(app)?;
    let _guard = CLOCK_IO.lock().map_err(|e| e.to_string())?;
    write_atomic(&path, data)
}

fn read_items_unlocked(path: &PathBuf) -> Result<Vec<CountdownItem>, String> {
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse countdowns.json: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Failed to read the countdowns: {e}")),
    }
}

pub(super) fn read_items(app: &AppHandle) -> Result<Vec<CountdownItem>, String> {
    let path = countdown_path(app)?;
    let _guard = CLOCK_IO.lock().map_err(|e| e.to_string())?;
    read_items_unlocked(&path)
}

/// 在单次互斥锁内完成读取、修改与原子写回，并在成功后广播 `clock-changed`。
pub(super) fn mutate_items<R>(
    app: &AppHandle,
    mutate: impl FnOnce(&mut Vec<CountdownItem>) -> Result<R, String>,
) -> Result<R, String> {
    let path = countdown_path(app)?;
    let output = {
        let _guard = CLOCK_IO.lock().map_err(|e| e.to_string())?;
        let mut items = read_items_unlocked(&path)?;
        let res = mutate(&mut items)?;
        let serialized = serde_json::to_string(&items)
            .map_err(|e| format!("Failed to serialize countdowns: {e}"))?;
        write_atomic(&path, &serialized)?;
        res
    };
    let _ = app.emit(CLOCK_CHANGED_EVENT, ());
    Ok(output)
}
