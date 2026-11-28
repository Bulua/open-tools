//! 计算器历史记录 SQLite 持久化层（基于全应用统一基座 `core::db::Database`）。

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::core::db::{now_datetime, Database, Migration};
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

const MAX_HISTORY: i64 = 50;

const CALCULATOR_MIGRATIONS: &[Migration] = &[Migration {
    id: "calculator_001_init",
    sql: r#"
        CREATE TABLE IF NOT EXISTS calculator_history (
            id TEXT PRIMARY KEY,
            expression TEXT NOT NULL,
            result TEXT NOT NULL,
            angle_unit TEXT NOT NULL DEFAULT 'deg',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_calculator_history_created
            ON calculator_history(created_at DESC, id DESC);
    "#,
}];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CalculatorHistoryItem {
    pub(crate) id: String,
    pub(crate) expression: String,
    pub(crate) result: String,
    pub(crate) angle_unit: String,
    pub(crate) created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CalculatorHistoryImportItem {
    pub(crate) expression: String,
    pub(crate) result: String,
    pub(crate) angle_unit: Option<String>,
}

fn normalize_angle_unit(raw: Option<&str>) -> &'static str {
    match raw.map(str::trim) {
        Some("rad") => "rad",
        _ => "deg",
    }
}

fn query_history_conn(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<CalculatorHistoryItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, expression, result, angle_unit, created_at
         FROM calculator_history
         ORDER BY created_at DESC, id DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([MAX_HISTORY], |row| {
        Ok(CalculatorHistoryItem {
            id: row.get(0)?,
            expression: row.get(1)?,
            result: row.get(2)?,
            angle_unit: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

fn trim_history_conn(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM calculator_history
         WHERE id NOT IN (
             SELECT id FROM calculator_history
             ORDER BY created_at DESC, id DESC
             LIMIT ?1
         )",
        [MAX_HISTORY],
    )?;
    Ok(())
}

pub(crate) fn init_calculator_storage(db: &Database) -> AppResult<()> {
    db.migrate(CALCULATOR_MIGRATIONS)
}

pub(crate) async fn list_history(db: &Database) -> AppResult<Vec<CalculatorHistoryItem>> {
    db.run_blocking(query_history_conn).await
}

pub(crate) async fn add_history(
    db: &Database,
    expression: String,
    result: String,
    angle_unit: Option<String>,
) -> AppResult<Vec<CalculatorHistoryItem>> {
    let expr = expression.trim().to_string();
    let res_text = result.trim().to_string();
    if expr.is_empty() || res_text.is_empty() {
        return Err(AppError::invalid_input(
            "Calculator history expression and result must not be empty.",
        ));
    }
    let unit = normalize_angle_unit(angle_unit.as_deref()).to_string();
    db.run_transaction(move |tx| {
        tx.execute(
            "INSERT INTO calculator_history (id, expression, result, angle_unit, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![next_id_string(), expr, res_text, unit, now_datetime()],
        )?;
        trim_history_conn(tx)?;
        query_history_conn(tx)
    })
    .await
}

pub(crate) async fn import_history(
    db: &Database,
    items: Vec<CalculatorHistoryImportItem>,
) -> AppResult<Vec<CalculatorHistoryItem>> {
    db.run_transaction(move |tx| {
        let count: i64 =
            tx.query_row("SELECT COUNT(1) FROM calculator_history", [], |row| row.get(0))?;
        if count == 0 {
            let now = now_datetime();
            for item in items.into_iter().take(MAX_HISTORY as usize).rev() {
                let expr = item.expression.trim();
                let res_text = item.result.trim();
                if expr.is_empty() || res_text.is_empty() {
                    continue;
                }
                tx.execute(
                    "INSERT INTO calculator_history (id, expression, result, angle_unit, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        next_id_string(),
                        expr,
                        res_text,
                        normalize_angle_unit(item.angle_unit.as_deref()),
                        &now,
                    ],
                )?;
            }
            trim_history_conn(tx)?;
        }
        query_history_conn(tx)
    })
    .await
}

pub(crate) async fn delete_history(
    db: &Database,
    id: String,
) -> AppResult<Vec<CalculatorHistoryItem>> {
    db.run_transaction(move |tx| {
        tx.execute("DELETE FROM calculator_history WHERE id = ?1", [id.trim()])?;
        query_history_conn(tx)
    })
    .await
}

pub(crate) async fn clear_history(db: &Database) -> AppResult<()> {
    db.run_transaction(|tx| {
        tx.execute("DELETE FROM calculator_history", [])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn adds_trims_deletes_and_clears_history() {
        let db = Database::open_in_memory().unwrap();
        init_calculator_storage(&db).unwrap();

        let imported = import_history(
            &db,
            vec![
                CalculatorHistoryImportItem {
                    expression: "2+2".into(),
                    result: "4".into(),
                    angle_unit: Some("deg".into()),
                },
                CalculatorHistoryImportItem {
                    expression: "1+1".into(),
                    result: "2".into(),
                    angle_unit: None,
                },
            ],
        )
        .await
        .unwrap();
        assert_eq!(imported.len(), 2);
        assert_eq!(imported[0].expression, "2+2");

        for i in 0..55 {
            add_history(&db, format!("{i}+1"), format!("{}", i + 1), Some("rad".into()))
                .await
                .unwrap();
        }
        let all = list_history(&db).await.unwrap();
        assert_eq!(all.len(), 50);
        assert_eq!(all[0].expression, "54+1");
        assert_eq!(all[0].angle_unit, "rad");

        let after_del = delete_history(&db, all[0].id.clone()).await.unwrap();
        assert_eq!(after_del.len(), 49);

        clear_history(&db).await.unwrap();
        assert!(list_history(&db).await.unwrap().is_empty());
    }
}
