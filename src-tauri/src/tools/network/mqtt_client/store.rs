//! MQTT 工作区 SQLite 持久化层（无 JSON 关系表：复用 `folders` + 独立 `mqtt_sessions` / `mqtt_session_topics`）。

use std::collections::{HashMap, HashSet};

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::core::db::{folders::list_folders, now_datetime, Database, Migration};
use crate::core::error::{AppError, AppResult};
use crate::core::id::next_id_string;

const MQTT_SCOPE: &str = "mqtt";

const MQTT_MIGRATIONS: &[Migration] = &[Migration {
    id: "mqtt_001_init",
    sql: r#"
        CREATE TABLE IF NOT EXISTS mqtt_sessions (
            id TEXT PRIMARY KEY,
            folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            transport TEXT NOT NULL DEFAULT 'mqtt',
            host TEXT NOT NULL DEFAULT '127.0.0.1',
            port INTEGER NOT NULL DEFAULT 1883,
            path TEXT NOT NULL DEFAULT '/mqtt',
            client_id TEXT NOT NULL,
            username TEXT NOT NULL DEFAULT '',
            keep_alive INTEGER NOT NULL DEFAULT 60,
            clean_session INTEGER NOT NULL DEFAULT 1,
            tls INTEGER NOT NULL DEFAULT 0,
            protocol_version TEXT NOT NULL DEFAULT '3.1.1',
            connect_timeout INTEGER NOT NULL DEFAULT 10,
            auto_reconnect INTEGER NOT NULL DEFAULT 0,
            reconnect_period INTEGER NOT NULL DEFAULT 4000,
            will_enabled INTEGER NOT NULL DEFAULT 0,
            will_topic TEXT NOT NULL DEFAULT '',
            will_payload TEXT NOT NULL DEFAULT '',
            will_qos INTEGER NOT NULL DEFAULT 0,
            will_retain INTEGER NOT NULL DEFAULT 0,
            subscription_qos INTEGER NOT NULL DEFAULT 0,
            publish_topic TEXT NOT NULL DEFAULT 'test/demo',
            publish_qos INTEGER NOT NULL DEFAULT 0,
            publish_retain INTEGER NOT NULL DEFAULT 0,
            publish_payload TEXT NOT NULL DEFAULT '',
            publish_mode TEXT NOT NULL DEFAULT 'text',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mqtt_sessions_order
            ON mqtt_sessions(folder_id, sort_order ASC, created_at ASC);

        CREATE TABLE IF NOT EXISTS mqtt_session_topics (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES mqtt_sessions(id) ON DELETE CASCADE,
            topic TEXT NOT NULL,
            qos INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            UNIQUE(session_id, topic)
        );
    "#,
}];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MqttTopicItem {
    pub(crate) topic: String,
    pub(crate) qos: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MqttSessionConfig {
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) client_id: String,
    pub(crate) username: String,
    pub(crate) keep_alive: u16,
    pub(crate) clean_session: bool,
    pub(crate) tls: bool,
    pub(crate) transport: String,
    pub(crate) path: String,
    pub(crate) protocol_version: String,
    pub(crate) connect_timeout: u16,
    pub(crate) auto_reconnect: bool,
    pub(crate) reconnect_period: u32,
    pub(crate) will_enabled: bool,
    pub(crate) will_topic: String,
    pub(crate) will_payload: String,
    pub(crate) will_qos: u8,
    pub(crate) will_retain: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MqttDraftDto {
    pub(crate) config: MqttSessionConfig,
    pub(crate) topics: Vec<MqttTopicItem>,
    pub(crate) subscription_qos: u8,
    pub(crate) publish_topic: String,
    pub(crate) publish_qos: u8,
    pub(crate) retain: bool,
    pub(crate) payload: String,
    pub(crate) mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum MqttTreeNodeDto {
    #[serde(rename_all = "camelCase")]
    Folder {
        id: String,
        parent_id: Option<String>,
        name: String,
        collapsed: bool,
    },
    #[serde(rename_all = "camelCase")]
    Session {
        id: String,
        parent_id: Option<String>,
        name: String,
        draft: MqttDraftDto,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MqttWorkspaceDto {
    pub(crate) nodes: Vec<MqttTreeNodeDto>,
    pub(crate) active_id: String,
}

pub(crate) fn init_mqtt_storage(db: &Database) -> AppResult<()> {
    db.migrate(MQTT_MIGRATIONS)
}

pub(crate) async fn load_workspace(db: &Database) -> AppResult<Option<MqttWorkspaceDto>> {
    db.run_blocking(|conn| {
        let folders = list_folders(conn, MQTT_SCOPE)?;

        let mut topic_stmt = conn.prepare(
            "SELECT session_id, topic, qos
             FROM mqtt_session_topics
             ORDER BY sort_order ASC, created_at ASC",
        )?;
        let topic_rows = topic_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut topics_by_session: HashMap<String, Vec<MqttTopicItem>> = HashMap::new();
        for (session_id, topic, qos) in topic_rows {
            topics_by_session
                .entry(session_id)
                .or_default()
                .push(MqttTopicItem {
                    topic,
                    qos: qos.clamp(0, 2) as u8,
                });
        }

        let mut session_stmt = conn.prepare(
            "SELECT id, folder_id, name, is_active, sort_order,
                    transport, host, port, path, client_id, username,
                    keep_alive, clean_session, tls, protocol_version,
                    connect_timeout, auto_reconnect, reconnect_period,
                    will_enabled, will_topic, will_payload, will_qos, will_retain,
                    subscription_qos, publish_topic, publish_qos, publish_retain,
                    publish_payload, publish_mode, created_at
             FROM mqtt_sessions
             ORDER BY sort_order ASC, created_at ASC",
        )?;

        let session_rows = session_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)? != 0,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(29)?,
                    MqttDraftDto {
                        config: MqttSessionConfig {
                            transport: row.get(5)?,
                            host: row.get(6)?,
                            port: row.get::<_, i64>(7)?.clamp(1, 65535) as u16,
                            path: row.get(8)?,
                            client_id: row.get(9)?,
                            username: row.get(10)?,
                            keep_alive: row.get::<_, i64>(11)?.clamp(5, 65535) as u16,
                            clean_session: row.get::<_, i64>(12)? != 0,
                            tls: row.get::<_, i64>(13)? != 0,
                            protocol_version: row.get(14)?,
                            connect_timeout: row.get::<_, i64>(15)?.clamp(1, 3600) as u16,
                            auto_reconnect: row.get::<_, i64>(16)? != 0,
                            reconnect_period: row.get::<_, i64>(17)?.max(100) as u32,
                            will_enabled: row.get::<_, i64>(18)? != 0,
                            will_topic: row.get(19)?,
                            will_payload: row.get(20)?,
                            will_qos: row.get::<_, i64>(21)?.clamp(0, 2) as u8,
                            will_retain: row.get::<_, i64>(22)? != 0,
                        },
                        topics: Vec::new(),
                        subscription_qos: row.get::<_, i64>(23)?.clamp(0, 2) as u8,
                        publish_topic: row.get(24)?,
                        publish_qos: row.get::<_, i64>(25)?.clamp(0, 2) as u8,
                        retain: row.get::<_, i64>(26)? != 0,
                        payload: row.get(27)?,
                        mode: row.get(28)?,
                    },
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        if folders.is_empty() && session_rows.is_empty() {
            return Ok(None);
        }

        let mut ordered: Vec<(i64, String, MqttTreeNodeDto)> =
            Vec::with_capacity(folders.len() + session_rows.len());
        for f in folders {
            ordered.push((
                f.sort_order,
                f.created_at,
                MqttTreeNodeDto::Folder {
                    id: f.id,
                    parent_id: f.parent_id,
                    name: f.name,
                    collapsed: f.collapsed,
                },
            ));
        }

        let mut active_id = String::new();
        let mut first_session_id = String::new();
        for (id, folder_id, name, is_active, sort_order, created_at, mut draft) in session_rows {
            if first_session_id.is_empty() {
                first_session_id = id.clone();
            }
            if is_active {
                active_id = id.clone();
            }
            draft.topics = topics_by_session.remove(&id).unwrap_or_default();
            ordered.push((
                sort_order,
                created_at,
                MqttTreeNodeDto::Session {
                    id,
                    parent_id: folder_id,
                    name,
                    draft,
                },
            ));
        }

        ordered.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
        let nodes = ordered.into_iter().map(|(_, _, node)| node).collect();
        if active_id.is_empty() {
            active_id = first_session_id;
        }

        Ok(Some(MqttWorkspaceDto { nodes, active_id }))
    })
    .await
}

pub(crate) async fn save_workspace(
    db: &Database,
    workspace: MqttWorkspaceDto,
) -> AppResult<MqttWorkspaceDto> {
    if workspace.nodes.is_empty() {
        return Err(AppError::invalid_input(
            "MQTT workspace must contain at least one node.",
        ));
    }

    // 统一整理节点 ID（缺省补雪花 ID）
    let mut id_remap: HashMap<String, String> = HashMap::new();
    let mut raw_nodes = Vec::with_capacity(workspace.nodes.len());
    for node in workspace.nodes {
        match node {
            MqttTreeNodeDto::Folder {
                id,
                parent_id,
                name,
                collapsed,
            } => {
                let trimmed_name = name.trim();
                if trimmed_name.is_empty() {
                    continue;
                }
                let old_id = id.trim().to_string();
                let final_id = if old_id.is_empty() {
                    next_id_string()
                } else {
                    old_id.clone()
                };
                if !old_id.is_empty() {
                    id_remap.insert(old_id, final_id.clone());
                }
                raw_nodes.push(MqttTreeNodeDto::Folder {
                    id: final_id,
                    parent_id,
                    name: trimmed_name.to_string(),
                    collapsed,
                });
            }
            MqttTreeNodeDto::Session {
                id,
                parent_id,
                name,
                draft,
            } => {
                let trimmed_name = name.trim();
                if trimmed_name.is_empty() {
                    continue;
                }
                let old_id = id.trim().to_string();
                let final_id = if old_id.is_empty() {
                    next_id_string()
                } else {
                    old_id.clone()
                };
                if !old_id.is_empty() {
                    id_remap.insert(old_id, final_id.clone());
                }
                raw_nodes.push(MqttTreeNodeDto::Session {
                    id: final_id,
                    parent_id,
                    name: trimmed_name.to_string(),
                    draft,
                });
            }
        }
    }

    let folder_id_set: HashSet<String> = raw_nodes
        .iter()
        .filter_map(|node| match node {
            MqttTreeNodeDto::Folder { id, .. } => Some(id.clone()),
            _ => None,
        })
        .collect();

    let mut normalized_nodes = Vec::with_capacity(raw_nodes.len());
    let mut session_id_set = HashSet::new();
    let mut first_session_id = String::new();
    for node in raw_nodes {
        match node {
            MqttTreeNodeDto::Folder {
                id,
                parent_id,
                name,
                collapsed,
            } => {
                let resolved_parent = parent_id
                    .map(|p| id_remap.get(p.trim()).cloned().unwrap_or(p))
                    .filter(|p| p != &id && folder_id_set.contains(p));
                normalized_nodes.push(MqttTreeNodeDto::Folder {
                    id,
                    parent_id: resolved_parent,
                    name,
                    collapsed,
                });
            }
            MqttTreeNodeDto::Session {
                id,
                parent_id,
                name,
                draft,
            } => {
                if first_session_id.is_empty() {
                    first_session_id = id.clone();
                }
                session_id_set.insert(id.clone());
                let resolved_parent = parent_id
                    .map(|p| id_remap.get(p.trim()).cloned().unwrap_or(p))
                    .filter(|p| folder_id_set.contains(p));
                normalized_nodes.push(MqttTreeNodeDto::Session {
                    id,
                    parent_id: resolved_parent,
                    name,
                    draft,
                });
            }
        }
    }

    let active_id = if session_id_set.contains(workspace.active_id.trim()) {
        workspace.active_id.trim().to_string()
    } else {
        first_session_id
    };

    let nodes_to_save = normalized_nodes.clone();
    let active_for_db = active_id.clone();

    db.run_transaction(move |tx| {
        let now = now_datetime();

        // 1. 解除现有外键引用，防止删除旧目录或重排嵌套文件夹时触犯外键约束
        tx.execute("UPDATE mqtt_sessions SET folder_id = NULL", [])?;
        tx.execute(
            "UPDATE folders SET parent_id = NULL WHERE scope = ?1",
            [MQTT_SCOPE],
        )?;

        // 2. 清理已移除的会话与文件夹
        let existing_sessions: Vec<String> = {
            let mut stmt = tx.prepare("SELECT id FROM mqtt_sessions")?;
            let rows = stmt.query_map([], |row| row.get(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        for old_id in existing_sessions {
            if !session_id_set.contains(&old_id) {
                tx.execute("DELETE FROM mqtt_sessions WHERE id = ?1", [&old_id])?;
            }
        }

        let existing_folders: Vec<String> = {
            let mut stmt = tx.prepare("SELECT id FROM folders WHERE scope = ?1")?;
            let rows = stmt.query_map([MQTT_SCOPE], |row| row.get(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        for old_id in existing_folders {
            if !folder_id_set.contains(&old_id) {
                tx.execute(
                    "DELETE FROM folders WHERE id = ?1 AND scope = ?2",
                    params![&old_id, MQTT_SCOPE],
                )?;
            }
        }

        // 3. 第一阶段：先写入/更新全部文件夹（parent_id = NULL）
        let mut pending_folder_parents: Vec<(String, String)> = Vec::new();
        for (order, node) in nodes_to_save.iter().enumerate() {
            if let MqttTreeNodeDto::Folder {
                id,
                parent_id,
                name,
                collapsed,
            } = node
            {
                tx.execute(
                    "INSERT INTO folders (
                        id, scope, parent_id, name, pinned, collapsed, sort_order, created_at, updated_at
                     ) VALUES (?1, ?2, NULL, ?3, 0, ?4, ?5, ?6, ?7)
                     ON CONFLICT(id) DO UPDATE SET
                        parent_id = NULL,
                        name = excluded.name,
                        collapsed = excluded.collapsed,
                        sort_order = excluded.sort_order,
                        updated_at = excluded.updated_at",
                    params![
                        id,
                        MQTT_SCOPE,
                        name,
                        if *collapsed { 1i64 } else { 0i64 },
                        order as i64,
                        &now,
                        &now,
                    ],
                )?;
                if let Some(pid) = parent_id {
                    pending_folder_parents.push((id.clone(), pid.clone()));
                }
            }
        }

        // 4. 第二阶段：还原文件夹父级关联
        for (id, pid) in pending_folder_parents {
            tx.execute(
                "UPDATE folders SET parent_id = ?1 WHERE id = ?2 AND scope = ?3",
                params![pid, id, MQTT_SCOPE],
            )?;
        }

        // 5. 写入/更新全部 MQTT 会话及其订阅主题子表
        for (order, node) in nodes_to_save.iter().enumerate() {
            if let MqttTreeNodeDto::Session {
                id,
                parent_id,
                name,
                draft,
            } = node
            {
                let c = &draft.config;
                let is_active = if id == &active_for_db { 1i64 } else { 0i64 };
                tx.execute(
                    "INSERT INTO mqtt_sessions (
                        id, folder_id, name, is_active, sort_order,
                        transport, host, port, path, client_id, username,
                        keep_alive, clean_session, tls, protocol_version,
                        connect_timeout, auto_reconnect, reconnect_period,
                        will_enabled, will_topic, will_payload, will_qos, will_retain,
                        subscription_qos, publish_topic, publish_qos, publish_retain,
                        publish_payload, publish_mode, created_at, updated_at
                     ) VALUES (
                        ?1, ?2, ?3, ?4, ?5,
                        ?6, ?7, ?8, ?9, ?10, ?11,
                        ?12, ?13, ?14, ?15,
                        ?16, ?17, ?18,
                        ?19, ?20, ?21, ?22, ?23,
                        ?24, ?25, ?26, ?27,
                        ?28, ?29, ?30, ?31
                     )
                     ON CONFLICT(id) DO UPDATE SET
                        folder_id = excluded.folder_id,
                        name = excluded.name,
                        is_active = excluded.is_active,
                        sort_order = excluded.sort_order,
                        transport = excluded.transport,
                        host = excluded.host,
                        port = excluded.port,
                        path = excluded.path,
                        client_id = excluded.client_id,
                        username = excluded.username,
                        keep_alive = excluded.keep_alive,
                        clean_session = excluded.clean_session,
                        tls = excluded.tls,
                        protocol_version = excluded.protocol_version,
                        connect_timeout = excluded.connect_timeout,
                        auto_reconnect = excluded.auto_reconnect,
                        reconnect_period = excluded.reconnect_period,
                        will_enabled = excluded.will_enabled,
                        will_topic = excluded.will_topic,
                        will_payload = excluded.will_payload,
                        will_qos = excluded.will_qos,
                        will_retain = excluded.will_retain,
                        subscription_qos = excluded.subscription_qos,
                        publish_topic = excluded.publish_topic,
                        publish_qos = excluded.publish_qos,
                        publish_retain = excluded.publish_retain,
                        publish_payload = excluded.publish_payload,
                        publish_mode = excluded.publish_mode,
                        updated_at = excluded.updated_at",
                    params![
                        id,
                        parent_id,
                        name,
                        is_active,
                        order as i64,
                        c.transport,
                        c.host,
                        i64::from(c.port),
                        c.path,
                        c.client_id,
                        c.username,
                        i64::from(c.keep_alive),
                        if c.clean_session { 1i64 } else { 0i64 },
                        if c.tls { 1i64 } else { 0i64 },
                        c.protocol_version,
                        i64::from(c.connect_timeout),
                        if c.auto_reconnect { 1i64 } else { 0i64 },
                        i64::from(c.reconnect_period),
                        if c.will_enabled { 1i64 } else { 0i64 },
                        c.will_topic,
                        c.will_payload,
                        i64::from(c.will_qos),
                        if c.will_retain { 1i64 } else { 0i64 },
                        i64::from(draft.subscription_qos),
                        draft.publish_topic,
                        i64::from(draft.publish_qos),
                        if draft.retain { 1i64 } else { 0i64 },
                        draft.payload,
                        draft.mode,
                        &now,
                        &now,
                    ],
                )?;

                tx.execute(
                    "DELETE FROM mqtt_session_topics WHERE session_id = ?1",
                    [id],
                )?;
                let mut seen_topics = HashSet::new();
                for (t_idx, item) in draft.topics.iter().enumerate() {
                    if !seen_topics.insert(&item.topic) {
                        continue;
                    }
                    tx.execute(
                        "INSERT INTO mqtt_session_topics (
                            id, session_id, topic, qos, sort_order, created_at
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![
                            next_id_string(),
                            id,
                            item.topic,
                            i64::from(item.qos.min(2)),
                            t_idx as i64,
                            &now,
                        ],
                    )?;
                }
            }
        }

        Ok(())
    })
    .await?;

    Ok(MqttWorkspaceDto {
        nodes: normalized_nodes,
        active_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_draft(host: &str) -> MqttDraftDto {
        MqttDraftDto {
            config: MqttSessionConfig {
                host: host.into(),
                port: 1883,
                client_id: "open-tools-test".into(),
                username: "user".into(),
                keep_alive: 60,
                clean_session: true,
                tls: false,
                transport: "mqtt".into(),
                path: "/mqtt".into(),
                protocol_version: "5.0".into(),
                connect_timeout: 10,
                auto_reconnect: true,
                reconnect_period: 4000,
                will_enabled: true,
                will_topic: "will/topic".into(),
                will_payload: "bye".into(),
                will_qos: 1,
                will_retain: true,
            },
            topics: vec![
                MqttTopicItem {
                    topic: "sensor/#".into(),
                    qos: 1,
                },
                MqttTopicItem {
                    topic: "device/+/status".into(),
                    qos: 2,
                },
            ],
            subscription_qos: 1,
            publish_topic: "cmd/test".into(),
            publish_qos: 1,
            retain: true,
            payload: "{\"ok\":true}".into(),
            mode: "json".into(),
        }
    }

    #[tokio::test]
    async fn saves_and_loads_nested_mqtt_workspace_in_order() {
        let db = Database::open_in_memory().unwrap();
        init_mqtt_storage(&db).unwrap();
        assert!(load_workspace(&db).await.unwrap().is_none());

        // 子文件夹刻意排在父文件夹之前，验证两阶段外键处理
        let input = MqttWorkspaceDto {
            active_id: "s-2".into(),
            nodes: vec![
                MqttTreeNodeDto::Folder {
                    id: "f-child".into(),
                    parent_id: Some("f-root".into()),
                    name: "Sub".into(),
                    collapsed: true,
                },
                MqttTreeNodeDto::Session {
                    id: "s-1".into(),
                    parent_id: Some("f-child".into()),
                    name: "Broker A".into(),
                    draft: sample_draft("10.0.0.1"),
                },
                MqttTreeNodeDto::Folder {
                    id: "f-root".into(),
                    parent_id: None,
                    name: "Root".into(),
                    collapsed: false,
                },
                MqttTreeNodeDto::Session {
                    id: "s-2".into(),
                    parent_id: None,
                    name: "Broker B".into(),
                    draft: sample_draft("10.0.0.2"),
                },
            ],
        };

        save_workspace(&db, input.clone()).await.unwrap();
        let loaded = load_workspace(&db).await.unwrap().unwrap();
        assert_eq!(loaded, input);

        // 删除父文件夹与其中一个会话后再次同步
        let trimmed = MqttWorkspaceDto {
            active_id: "s-2".into(),
            nodes: vec![loaded.nodes[3].clone()],
        };
        save_workspace(&db, trimmed.clone()).await.unwrap();
        let reloaded = load_workspace(&db).await.unwrap().unwrap();
        assert_eq!(reloaded, trimmed);
    }
}
