//! 全应用统一 SQLite 数据库基座（`data/open-tools.db`）。
//!
//! 所有工具模块统一通过 `Database`（注册在 Tauri `State` 中）访问数据库：
//! - `db.migrate(&[...])`：按模块注册幂等 SQL 迁移脚本；
//! - `db.with_conn(...)` / `db.run_blocking(...)`：同步或异步查询与写入；
//! - `db.transaction(...)` / `db.run_transaction(...)`：事务执行；
//! - `settings` / `folders`：全应用共享的通用 KV 设置表与通用文件夹表。

pub(crate) mod folders;
pub(crate) mod settings;

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::{Connection, OptionalExtension, Transaction};

use crate::core::error::{AppError, AppResult};

/// 单条版本化 SQL 迁移定义，各模块按 `<模块>_<序号>_<名称>` 命名（例如 `ai_001_init`）。
#[derive(Debug, Clone, Copy)]
pub(crate) struct Migration {
    pub(crate) id: &'static str,
    pub(crate) sql: &'static str,
}

const CORE_MIGRATIONS: &[Migration] = &[
    Migration {
        id: "core_001_init",
        sql: r#"
            CREATE TABLE IF NOT EXISTS app_settings (
                scope TEXT NOT NULL,
                key TEXT NOT NULL,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (scope, key)
            );

            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
                name TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                collapsed INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_folders_scope_order
                ON folders(scope, pinned, sort_order, created_at);
        "#,
    },
    Migration {
        id: "core_002_datetime_format",
        sql: r#"
            UPDATE schema_migrations
            SET applied_at = datetime(applied_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(applied_at) IN ('integer', 'real');

            UPDATE app_settings
            SET updated_at = datetime(updated_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(updated_at) IN ('integer', 'real');

            UPDATE folders
            SET created_at = datetime(created_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(created_at) IN ('integer', 'real');

            UPDATE folders
            SET updated_at = datetime(updated_at / 1000.0, 'unixepoch', 'localtime')
            WHERE typeof(updated_at) IN ('integer', 'real');
        "#,
    },
];

/// 返回当前本地时间字符串（`YYYY-MM-DD HH:MM:SS`）。
pub(crate) fn now_datetime() -> String {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::SYSTEMTIME;
        use windows_sys::Win32::System::SystemInformation::GetLocalTime;
        let mut st = SYSTEMTIME::default();
        unsafe { GetLocalTime(&mut st) };
        format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
            st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond
        )
    }
    #[cfg(not(windows))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let days = secs.div_euclid(86_400);
        let sod = secs.rem_euclid(86_400);
        let hour = sod / 3_600;
        let minute = (sod % 3_600) / 60;
        let second = sod % 60;
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = doy - (153 * mp + 2) / 5 + 1;
        let month = mp + if mp < 10 { 3 } else { -9 };
        let year = y + if month <= 2 { 1 } else { 0 };
        format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}")
    }
}

fn is_valid_datetime(text: &str) -> bool {
    let b = text.as_bytes();
    b.len() == 19
        && b[4] == b'-'
        && b[7] == b'-'
        && b[10] == b' '
        && b[13] == b':'
        && b[16] == b':'
        && b.iter()
            .enumerate()
            .all(|(i, ch)| matches!(i, 4 | 7 | 10 | 13 | 16) || ch.is_ascii_digit())
}

/// 规范化前端或迁移传入的时间文本，缺失或格式非法时回退为当前本地时间。
pub(crate) fn normalize_datetime(raw: Option<&str>) -> String {
    match raw.map(str::trim).filter(|s| is_valid_datetime(s)) {
        Some(valid) => valid.to_string(),
        None => now_datetime(),
    }
}

/// 借助 SQLite `localtime` 将毫秒时间戳转换为 `YYYY-MM-DD HH:MM:SS`。
pub(crate) fn millis_to_datetime_conn(conn: &Connection, millis: i64) -> String {
    conn.query_row(
        "SELECT datetime(?1 / 1000.0, 'unixepoch', 'localtime')",
        [millis],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .ok()
    .flatten()
    .flatten()
    .filter(|s| is_valid_datetime(s))
    .unwrap_or_else(now_datetime)
}

#[derive(Clone)]
pub(crate) struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// 打开或创建磁盘 SQLite 数据库文件，并初始化 WAL、外键约束与公共表结构。
    pub(crate) fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| {
                AppError::io(format!(
                    "Could not create database directory {}: {err}",
                    parent.display()
                ))
            })?;
        }
        let conn = Connection::open(path).map_err(|err| {
            AppError::io(format!(
                "Could not open SQLite database {}: {err}",
                path.display()
            ))
        })?;
        Self::init_connection(conn)
    }

    fn init_connection(conn: Connection) -> AppResult<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA synchronous = NORMAL;
             CREATE TABLE IF NOT EXISTS schema_migrations (
                 id TEXT PRIMARY KEY,
                 applied_at TEXT NOT NULL
             );",
        )
        .map_err(|err| AppError::io(format!("Could not initialize SQLite pragmas: {err}")))?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.migrate(CORE_MIGRATIONS)?;
        Ok(db)
    }

    /// 按顺序幂等执行模块注册的 SQL 迁移脚本。
    pub(crate) fn migrate(&self, migrations: &[Migration]) -> AppResult<()> {
        self.transaction(|tx| {
            for m in migrations {
                let already: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE id = ?1)",
                    [m.id],
                    |row| row.get(0),
                )?;
                if already {
                    continue;
                }
                tx.execute_batch(m.sql)?;
                tx.execute(
                    "INSERT INTO schema_migrations (id, applied_at) VALUES (?1, ?2)",
                    rusqlite::params![m.id, now_datetime()],
                )?;
            }
            Ok(())
        })
    }

    /// 同步获取数据库连接执行读写操作。
    pub(crate) fn with_conn<T>(
        &self,
        f: impl FnOnce(&Connection) -> rusqlite::Result<T>,
    ) -> AppResult<T> {
        let guard = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        f(&guard).map_err(|err| AppError::io(format!("Database error: {err}")))
    }

    /// 同步开启数据库事务执行原子读写操作。
    pub(crate) fn transaction<T>(
        &self,
        f: impl FnOnce(&Transaction<'_>) -> rusqlite::Result<T>,
    ) -> AppResult<T> {
        let mut guard = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let tx = guard
            .transaction()
            .map_err(|err| AppError::io(format!("Could not begin transaction: {err}")))?;
        let out = f(&tx).map_err(|err| AppError::io(format!("Database transaction error: {err}")))?;
        tx.commit()
            .map_err(|err| AppError::io(format!("Could not commit transaction: {err}")))?;
        Ok(out)
    }

    /// 在阻塞线程池上异步执行数据库读写，避免阻塞 Tauri 主异步运行时。
    pub(crate) async fn run_blocking<T>(
        &self,
        f: impl FnOnce(&Connection) -> rusqlite::Result<T> + Send + 'static,
    ) -> AppResult<T>
    where
        T: Send + 'static,
    {
        let db = self.clone();
        tauri::async_runtime::spawn_blocking(move || db.with_conn(f))
            .await
            .map_err(|err| AppError::internal(format!("Database task failed: {err}")))?
    }

    /// 在阻塞线程池上异步执行数据库事务。
    pub(crate) async fn run_transaction<T>(
        &self,
        f: impl FnOnce(&Transaction<'_>) -> rusqlite::Result<T> + Send + 'static,
    ) -> AppResult<T>
    where
        T: Send + 'static,
    {
        let db = self.clone();
        tauri::async_runtime::spawn_blocking(move || db.transaction(f))
            .await
            .map_err(|err| AppError::internal(format!("Database transaction task failed: {err}")))?
    }
}
