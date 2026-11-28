//! 将「时钟」的闹钟与倒计时器能力封装为统一 `AiTool`。

use std::collections::BTreeSet;

use serde_json::{json, Value};
use tauri::Manager;

use crate::core::db::{now_datetime, Database};
use crate::core::id::next_id_string;
use crate::tools::ai::args;
use crate::tools::ai::registry::{
    AiTool, AiToolContext, AiToolFuture, AiToolResult, ToolApprovalPolicy,
};

use super::store::{
    self, format_local_timestamp, local_now, next_alarm_target, parse_alarm_time, AlarmSchedule,
    CountdownItem,
};

const MAX_TIMER_HOURS: u64 = 99;
const MAX_TITLE_CHARS: usize = 80;

fn weekday_zh(day: u8) -> &'static str {
    match day {
        0 => "周日",
        1 => "周一",
        2 => "周二",
        3 => "周三",
        4 => "周四",
        5 => "周五",
        6 => "周六",
        _ => "",
    }
}

fn format_weekdays(weekdays: &[u8]) -> String {
    let set: BTreeSet<u8> = weekdays.iter().copied().collect();
    if set.is_empty() {
        return "仅一次".to_string();
    }
    if set.len() == 7 {
        return "每天".to_string();
    }
    if set.len() == 5 && (1..=5).all(|d| set.contains(&d)) {
        return "工作日".to_string();
    }
    let order = [1_u8, 2, 3, 4, 5, 6, 0];
    order
        .into_iter()
        .filter(|d| set.contains(d))
        .map(weekday_zh)
        .collect::<Vec<_>>()
        .join("、")
}

fn format_duration_ms(ms: i64) -> String {
    let total_secs = (ms.max(0) + 999) / 1000;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    let secs = total_secs % 60;
    if hours > 0 {
        format!("{hours:02}:{mins:02}:{secs:02}")
    } else {
        format!("{mins:02}:{secs:02}")
    }
}

fn truncate_title(raw: &str) -> String {
    raw.trim().chars().take(MAX_TITLE_CHARS).collect()
}

fn parse_weekdays_arg(args: &Value) -> Result<Option<Vec<u8>>, String> {
    let Some(val) = args.get("weekdays") else {
        return Ok(None);
    };
    if val.is_null() {
        return Ok(Some(Vec::new()));
    }
    let arr = val
        .as_array()
        .ok_or_else(|| "Parameter 'weekdays' must be an array of integers (0=Sunday .. 6=Saturday).".to_string())?;
    let mut unique = BTreeSet::new();
    for item in arr {
        let day = item
            .as_u64()
            .and_then(|v| u8::try_from(v).ok())
            .filter(|&d| d <= 6)
            .ok_or_else(|| "Each weekday must be an integer in 0..=6 (0=Sunday, 1=Monday .. 6=Saturday).".to_string())?;
        unique.insert(day);
    }
    Ok(Some(unique.into_iter().collect()))
}

enum ItemMatch {
    One(usize),
    None,
    Ambiguous(Vec<(String, String, &'static str)>),
}

fn find_item(items: &[CountdownItem], id: Option<&str>, title: Option<&str>) -> ItemMatch {
    if let Some(target_id) = id {
        return match items.iter().position(|item| item.id == target_id) {
            Some(idx) => ItemMatch::One(idx),
            None => ItemMatch::None,
        };
    }
    let Some(query) = title else {
        return ItemMatch::None;
    };
    let needle = query.trim().to_lowercase();
    let hits: Vec<usize> = items
        .iter()
        .enumerate()
        .filter(|(_, item)| item.title.trim().to_lowercase() == needle)
        .map(|(i, _)| i)
        .collect();
    if hits.len() == 1 {
        return ItemMatch::One(hits[0]);
    }
    if hits.len() > 1 {
        return ItemMatch::Ambiguous(
            hits.into_iter()
                .map(|i| {
                    let kind = if items[i].is_timer() { "timer" } else { "alarm" };
                    (items[i].id.clone(), items[i].title.clone(), kind)
                })
                .collect(),
        );
    }
    ItemMatch::None
}

pub(crate) struct ClockListTool;

impl AiTool for ClockListTool {
    fn name(&self) -> &'static str {
        "clock_list"
    }

    fn description(&self) -> &'static str {
        "Get the current local date/time/weekday together with all saved alarms and countdown timers in the Clock tool."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {}
        })
    }

    fn execute<'a>(&'a self, _args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let db = ctx.app.state::<Database>();
            let items = match store::read_items_sync(db.inner()) {
                Ok(list) => list,
                Err(err) => return AiToolResult::err(err.message),
            };
            let now = local_now();
            let now_str = format!(
                "{:04}-{:02}-{:02} {:02}:{:02}:{:02} ({})",
                now.year,
                now.month,
                now.day,
                now.hour,
                now.minute,
                now.second,
                weekday_zh(now.weekday)
            );

            let alarms: Vec<&CountdownItem> = items.iter().filter(|i| i.is_alarm()).collect();
            let timers: Vec<&CountdownItem> = items.iter().filter(|i| i.is_timer()).collect();

            let mut lines = vec![format!("Current local time: {now_str}")];
            if alarms.is_empty() {
                lines.push("Alarms: (none)".to_string());
            } else {
                lines.push(format!("Alarms ({}):", alarms.len()));
                for item in alarms {
                    let enabled = item.enabled != Some(false) && !item.done;
                    let status = if enabled { "enabled" } else { "disabled" };
                    let time_text = item
                        .alarm
                        .as_ref()
                        .map(|a| a.time.as_str())
                        .unwrap_or("--:--");
                    let schedule = item
                        .alarm
                        .as_ref()
                        .map(|a| format_weekdays(&a.weekdays))
                        .unwrap_or_else(|| "单次提醒".to_string());
                    let next_at = format_local_timestamp(item.target, now.tz_offset_ms);
                    let title = if item.title.trim().is_empty() {
                        "闹钟"
                    } else {
                        item.title.as_str()
                    };
                    lines.push(format!(
                        "- {time_text} | {title} | {schedule} | status: {status} | next: {next_at} | id: {}",
                        item.id
                    ));
                }
            }

            if timers.is_empty() {
                lines.push("Timers: (none)".to_string());
            } else {
                lines.push(format!("Timers ({}):", timers.len()));
                for item in timers {
                    let duration_ms = item.duration.unwrap_or(0);
                    let remaining_ms = item
                        .paused_remaining
                        .unwrap_or_else(|| item.target - now.utc_ms)
                        .max(0);
                    let status = if item.done || remaining_ms == 0 {
                        "finished"
                    } else if item.paused_remaining.is_some() {
                        "paused"
                    } else {
                        "running"
                    };
                    let title = if item.title.trim().is_empty() {
                        format!("{} 计时器", format_duration_ms(duration_ms))
                    } else {
                        item.title.clone()
                    };
                    lines.push(format!(
                        "- {title} | remaining: {} / {} | status: {status} | id: {}",
                        format_duration_ms(remaining_ms),
                        format_duration_ms(duration_ms),
                        item.id
                    ));
                }
            }

            AiToolResult::ok(lines.join("\n"))
        })
    }
}

pub(crate) struct ClockSetAlarmTool;

impl AiTool for ClockSetAlarmTool {
    fn name(&self) -> &'static str {
        "clock_set_alarm"
    }

    fn description(&self) -> &'static str {
        "Create a new alarm or update an existing alarm in the Clock tool. Triggers desktop notification and sound when due."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "time": {
                    "type": "string",
                    "description": "Alarm time in 24-hour 'HH:MM' format (e.g. '07:30', '21:00'). Required when creating a new alarm."
                },
                "title": {
                    "type": "string",
                    "description": "Short alarm label/reminder text (optional, defaults to '闹钟')."
                },
                "weekdays": {
                    "type": "array",
                    "items": { "type": "integer", "minimum": 0, "maximum": 6 },
                    "description": "Repeat weekdays: 0=Sunday, 1=Monday .. 6=Saturday. Empty array or omitted means one-time alarm."
                },
                "id": {
                    "type": "string",
                    "description": "Optional existing alarm ID (from clock_list) to update instead of creating a new one."
                },
                "enabled": {
                    "type": "boolean",
                    "description": "Whether the alarm is enabled (default true)."
                }
            }
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::Command
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let edit_id = args::trimmed(&args, "id");
            let time_arg = args::trimmed(&args, "time");
            let title_arg = args::trimmed(&args, "title");
            let weekdays_arg = match parse_weekdays_arg(&args) {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            let enabled_arg = args.get("enabled").and_then(Value::as_bool);

            if edit_id.is_none() && time_arg.is_none() {
                return AiToolResult::err(
                    "Parameter 'time' ('HH:MM') is required when creating a new alarm.",
                );
            }
            if let Some(ref t) = time_arg {
                if let Err(err) = parse_alarm_time(t) {
                    return AiToolResult::err(err);
                }
            }

            let now = local_now();
            let outcome = store::mutate_items(ctx.app, |items| {
                if let Some(ref id) = edit_id {
                    let Some(item) = items.iter_mut().find(|i| i.id == *id) else {
                        return Err(format!("Alarm with id '{id}' not found."));
                    };
                    if item.alarm.is_none() {
                        return Err(format!("Entry '{id}' is not an editable alarm."));
                    }
                    let current = item.alarm.clone().unwrap();
                    let schedule = AlarmSchedule {
                        time: time_arg.unwrap_or(current.time),
                        weekdays: weekdays_arg.unwrap_or(current.weekdays),
                    };
                    let enabled = enabled_arg.unwrap_or(true);
                    let target = next_alarm_target(&schedule)?;
                    if let Some(t) = title_arg {
                        item.title = truncate_title(&t);
                    }
                    item.alarm = Some(schedule.clone());
                    item.target = target;
                    item.repeat = "none".to_string();
                    item.done = false;
                    item.enabled = Some(enabled);

                    let next_at = format_local_timestamp(target, now.tz_offset_ms);
                    return Ok(format!(
                        "Updated alarm '{}' ({}, {}, status: {}, next: {}, id: {id}).",
                        item.title,
                        schedule.time,
                        format_weekdays(&schedule.weekdays),
                        if enabled { "enabled" } else { "disabled" },
                        next_at
                    ));
                }

                let time = time_arg.unwrap();
                let weekdays = weekdays_arg.unwrap_or_default();
                let schedule = AlarmSchedule {
                    time: time.clone(),
                    weekdays: weekdays.clone(),
                };
                let target = next_alarm_target(&schedule)?;
                let title = title_arg
                    .map(|t| truncate_title(&t))
                    .filter(|t| !t.is_empty())
                    .unwrap_or_else(|| "闹钟".to_string());
                let enabled = enabled_arg.unwrap_or(true);
                let mut id = next_id_string();
                while items.iter().any(|i| i.id == id) {
                    id = next_id_string();
                }
                let created = now_datetime();

                items.push(CountdownItem {
                    id: id.clone(),
                    title: title.clone(),
                    default_title: None,
                    target,
                    created_at: created.clone(),
                    updated_at: created,
                    duration: None,
                    paused_remaining: None,
                    repeat: "none".to_string(),
                    done: false,
                    alarm: Some(schedule),
                    enabled: Some(enabled),
                });

                let next_at = format_local_timestamp(target, now.tz_offset_ms);
                Ok(format!(
                    "Created alarm '{title}' ({time}, {}, next: {next_at}, id: {id}).",
                    format_weekdays(&weekdays)
                ))
            });

            match outcome {
                Ok(msg) => AiToolResult::ok(msg),
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}

pub(crate) struct ClockStartTimerTool;

impl AiTool for ClockStartTimerTool {
    fn name(&self) -> &'static str {
        "clock_start_timer"
    }

    fn description(&self) -> &'static str {
        "Create and immediately start a countdown timer in the Clock tool (e.g. 5 minutes, 25 minutes Pomodoro). Alerts automatically when time is up."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "hours": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 99,
                    "description": "Hours component (0-99, default 0)."
                },
                "minutes": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 59,
                    "description": "Minutes component (0-59, default 0)."
                },
                "seconds": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 59,
                    "description": "Seconds component (0-59, default 0)."
                },
                "title": {
                    "type": "string",
                    "description": "Optional timer label (leave empty to use automatic duration label)."
                }
            }
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::Command
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let hours = args::opt_usize(&args, "hours").unwrap_or(0) as u64;
            let minutes = args::opt_usize(&args, "minutes").unwrap_or(0) as u64;
            let seconds = args::opt_usize(&args, "seconds").unwrap_or(0) as u64;

            if hours > MAX_TIMER_HOURS || minutes > 59 || seconds > 59 {
                return AiToolResult::err(
                    "Invalid timer duration: hours must be 0..=99, minutes and seconds must be 0..=59.",
                );
            }
            let total_secs = hours * 3600 + minutes * 60 + seconds;
            if total_secs == 0 {
                return AiToolResult::err(
                    "Timer duration must be greater than 0 (provide hours, minutes, or seconds).",
                );
            }

            let duration_ms = (total_secs as i64) * 1000;
            let custom_title = args::trimmed(&args, "title")
                .map(|t| truncate_title(&t))
                .filter(|t| !t.is_empty());
            let (title, default_title) = match custom_title {
                Some(t) => (t, false),
                None => (String::new(), true),
            };

            let now = local_now();
            let target = now.utc_ms + duration_ms;

            let outcome = store::mutate_items(ctx.app, |items| {
                let mut id = next_id_string();
                while items.iter().any(|i| i.id == id) {
                    id = next_id_string();
                }
                let created = now_datetime();
                items.push(CountdownItem {
                    id: id.clone(),
                    title: title.clone(),
                    default_title: Some(default_title),
                    target,
                    created_at: created.clone(),
                    updated_at: created,
                    duration: Some(duration_ms),
                    paused_remaining: None,
                    repeat: "none".to_string(),
                    done: false,
                    alarm: None,
                    enabled: None,
                });

                let label = if title.is_empty() {
                    format!("{} 计时器", format_duration_ms(duration_ms))
                } else {
                    title
                };
                let ends_at = format_local_timestamp(target, now.tz_offset_ms);
                Ok(format!(
                    "Started timer '{label}' (duration: {}, ends at: {ends_at}, id: {id}).",
                    format_duration_ms(duration_ms)
                ))
            });

            match outcome {
                Ok(msg) => AiToolResult::ok(msg),
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}

pub(crate) struct ClockManageTool;

impl AiTool for ClockManageTool {
    fn name(&self) -> &'static str {
        "clock_manage"
    }

    fn description(&self) -> &'static str {
        "Manage an existing alarm or countdown timer by ID or title: enable/disable an alarm, pause/resume/restart a timer, or delete either."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Target alarm or timer ID (from clock_list)."
                },
                "title": {
                    "type": "string",
                    "description": "Exact title of the alarm or timer when id is omitted."
                },
                "action": {
                    "type": "string",
                    "enum": ["enable", "disable", "pause", "resume", "restart", "delete"],
                    "description": "Action to perform: enable/disable (for alarms), pause/resume/restart (for timers), or delete (for either)."
                }
            },
            "required": ["action"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::Command
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let id = args::trimmed(&args, "id");
            let title = args::trimmed(&args, "title");
            if id.is_none() && title.is_none() {
                return AiToolResult::err("Please provide either 'id' or 'title' of the clock item.");
            }
            let Some(action) = args::trimmed(&args, "action").map(|a| a.to_lowercase()) else {
                return AiToolResult::err("Parameter 'action' is required.");
            };

            let now = local_now();
            let outcome = store::mutate_items(ctx.app, |items| {
                let idx = match find_item(items, id.as_deref(), title.as_deref()) {
                    ItemMatch::One(i) => i,
                    ItemMatch::None => {
                        return Err(
                            "Clock item not found. Call clock_list to inspect current alarms and timers."
                                .to_string(),
                        );
                    }
                    ItemMatch::Ambiguous(candidates) => {
                        let list = candidates
                            .into_iter()
                            .map(|(cid, cname, kind)| format!("- [{kind}] {cname} (id: {cid})"))
                            .collect::<Vec<_>>()
                            .join("\n");
                        return Err(format!(
                            "Multiple clock items matched. Please specify 'id':\n{list}"
                        ));
                    }
                };

                if action == "delete" {
                    let removed = items.remove(idx);
                    let kind = if removed.is_timer() { "timer" } else { "alarm" };
                    return Ok(format!(
                        "Deleted {kind} '{}' (id: {}).",
                        removed.title, removed.id
                    ));
                }

                let item = &mut items[idx];
                match action.as_str() {
                    "enable" => {
                        let Some(ref schedule) = item.alarm else {
                            return Err("Action 'enable' only applies to alarms.".to_string());
                        };
                        let target = next_alarm_target(schedule)?;
                        item.enabled = Some(true);
                        item.done = false;
                        item.target = target;
                        let next_at = format_local_timestamp(target, now.tz_offset_ms);
                        Ok(format!(
                            "Enabled alarm '{}' ({}, next: {}, id: {}).",
                            item.title, schedule.time, next_at, item.id
                        ))
                    }
                    "disable" => {
                        if item.alarm.is_none() {
                            return Err("Action 'disable' only applies to alarms.".to_string());
                        }
                        item.enabled = Some(false);
                        Ok(format!("Disabled alarm '{}' (id: {}).", item.title, item.id))
                    }
                    "pause" => {
                        if !item.is_timer() {
                            return Err("Action 'pause' only applies to timers.".to_string());
                        }
                        if item.done {
                            return Err("Timer is already finished.".to_string());
                        }
                        if item.paused_remaining.is_some() {
                            return Ok(format!("Timer '{}' is already paused (id: {}).", item.title, item.id));
                        }
                        let remaining = (item.target - now.utc_ms).max(0);
                        item.paused_remaining = Some(remaining);
                        Ok(format!(
                            "Paused timer '{}' with {} remaining (id: {}).",
                            item.title,
                            format_duration_ms(remaining),
                            item.id
                        ))
                    }
                    "resume" => {
                        if !item.is_timer() {
                            return Err("Action 'resume' only applies to timers.".to_string());
                        }
                        let Some(remaining) = item.paused_remaining.take() else {
                            return Err("Timer is not paused.".to_string());
                        };
                        item.target = now.utc_ms + remaining;
                        item.done = false;
                        let ends_at = format_local_timestamp(item.target, now.tz_offset_ms);
                        Ok(format!(
                            "Resumed timer '{}' ({} remaining, ends at: {}, id: {}).",
                            item.title,
                            format_duration_ms(remaining),
                            ends_at,
                            item.id
                        ))
                    }
                    "restart" => {
                        let Some(duration_ms) = item.duration.filter(|_| item.is_timer()) else {
                            return Err("Action 'restart' only applies to timers.".to_string());
                        };
                        item.updated_at = now_datetime();
                        item.target = now.utc_ms + duration_ms;
                        item.paused_remaining = None;
                        item.done = false;
                        let ends_at = format_local_timestamp(item.target, now.tz_offset_ms);
                        Ok(format!(
                            "Restarted timer '{}' (duration: {}, ends at: {}, id: {}).",
                            item.title,
                            format_duration_ms(duration_ms),
                            ends_at,
                            item.id
                        ))
                    }
                    other => Err(format!(
                        "Unsupported action '{other}'. Expected enable, disable, pause, resume, restart, or delete."
                    )),
                }
            });

            match outcome {
                Ok(msg) => AiToolResult::ok(msg),
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}
