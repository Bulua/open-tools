//! 全局 64 位雪花算法（Snowflake）主键生成器。
//!
//! 位布局：`1 bit 符号位(0) | 41 bit 毫秒时间戳偏移 | 10 bit 节点 ID | 12 bit 序列号`。
//! 统一在 Rust 持久化层生成十进制字符串 ID，避免前端精度丢失并保证所有业务表主键规范一致。

use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// 基准纪元：2025-01-01T00:00:00Z（毫秒）
const EPOCH_MS: u64 = 1_735_689_600_000;
const WORKER_ID: u64 = 1;
const WORKER_SHIFT: u32 = 12;
const TIMESTAMP_SHIFT: u32 = 22;
const MAX_SEQUENCE: u64 = 0xFFF;
const MAX_TIMESTAMP_DELTA: u64 = (1u64 << 41) - 1;

#[derive(Default)]
struct SnowflakeState {
    last_ts: u64,
    sequence: u64,
}

static STATE: OnceLock<Mutex<SnowflakeState>> = OnceLock::new();

fn current_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(EPOCH_MS)
        .max(EPOCH_MS)
}

/// 生成全局唯一、单调递增的 64 位雪花 ID。
pub(crate) fn next_id() -> u64 {
    let lock = STATE.get_or_init(|| Mutex::new(SnowflakeState::default()));
    let mut state = lock.lock().unwrap_or_else(|err| err.into_inner());

    let now = current_millis();
    let mut ts = now.max(state.last_ts);

    if ts == state.last_ts {
        state.sequence = (state.sequence + 1) & MAX_SEQUENCE;
        if state.sequence == 0 {
            if now >= state.last_ts {
                while current_millis() <= state.last_ts {
                    std::hint::spin_loop();
                }
                ts = current_millis().max(state.last_ts + 1);
            } else {
                // 系统时钟发生回拨且同毫秒序号耗尽时，逻辑时钟直接顺延 1 ms 避免阻塞
                ts = state.last_ts + 1;
            }
        }
    } else {
        state.sequence = 0;
    }

    state.last_ts = ts;
    let delta = ts.saturating_sub(EPOCH_MS) & MAX_TIMESTAMP_DELTA;
    (delta << TIMESTAMP_SHIFT) | (WORKER_ID << WORKER_SHIFT) | state.sequence
}

/// 生成十进制字符串格式的雪花 ID，直接写入 SQLite `TEXT PRIMARY KEY`。
pub(crate) fn next_id_string() -> String {
    next_id().to_string()
}
