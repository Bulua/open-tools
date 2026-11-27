//! 全应用通用文件夹表（`folders`）读写辅助，按 `scope` 隔离各模块文件夹。

use rusqlite::Connection;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FolderRecord {
    pub(crate) id: String,
    pub(crate) parent_id: Option<String>,
    pub(crate) name: String,
    pub(crate) pinned: bool,
    pub(crate) collapsed: bool,
    pub(crate) sort_order: i64,
    pub(crate) created_at: i64,
}

pub(crate) fn list_folders(conn: &Connection, scope: &str) -> rusqlite::Result<Vec<FolderRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, name, pinned, collapsed, sort_order, created_at
         FROM folders
         WHERE scope = ?1
         ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([scope], |row| {
        Ok(FolderRecord {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
            pinned: row.get::<_, i64>(3)? != 0,
            collapsed: row.get::<_, i64>(4)? != 0,
            sort_order: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect()
}
