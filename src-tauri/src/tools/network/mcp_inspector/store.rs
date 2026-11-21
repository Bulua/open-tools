use std::{collections::HashSet, io::Write, path::Path};

use serde::{Deserialize, Serialize};

#[cfg(windows)]
use crate::core::dpapi::protect;
use crate::core::paths;

use super::config::McpConfig;

const FILE_NAME: &str = "mcp-connections.dat";
const VERSION: u8 = 1;

#[derive(Serialize, Deserialize)]
pub(crate) struct StoredConnection {
    id: String,
    name: String,
    config: McpConfig,
}

#[derive(Deserialize)]
struct StoredFile {
    version: u8,
    connections: Vec<StoredConnection>,
}

fn validate(connections: &[StoredConnection]) -> Result<(), String> {
    let mut ids = HashSet::new();
    if connections.iter().any(|item| {
        item.id.trim().is_empty() || item.name.trim().is_empty() || !ids.insert(&item.id)
    }) {
        return Err("The saved MCP connections contain an invalid name or ID.".into());
    }
    Ok(())
}

fn read_connections(path: &Path) -> Result<Vec<StoredConnection>, String> {
    let data = match std::fs::read(path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Could not read the saved MCP connections: {error}")),
    };
    #[cfg(windows)]
    let data = protect(&data, false)?;
    let file: StoredFile = serde_json::from_slice(&data)
        .map_err(|error| format!("Could not decode the saved MCP connections: {error}"))?;
    if file.version != VERSION {
        return Err("Unsupported MCP connection file version.".into());
    }
    validate(&file.connections)?;
    Ok(file.connections)
}

fn write_connections(path: &Path, connections: &[StoredConnection]) -> Result<(), String> {
    validate(connections)?;
    #[derive(Serialize)]
    struct FileRef<'a> {
        version: u8,
        connections: &'a [StoredConnection],
    }
    let data = serde_json::to_vec(&FileRef {
        version: VERSION,
        connections,
    })
    .map_err(|error| format!("Could not encode the MCP connections: {error}"))?;
    // 先保护数据，再写入临时文件，避免留下明文副本。
    #[cfg(windows)]
    let data = protect(&data, true)?;
    let parent = path.parent().ok_or("Missing MCP connection directory.")?;
    let result = (|| -> std::io::Result<()> {
        let mut file = tempfile::NamedTempFile::new_in(parent)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.as_file()
                .set_permissions(std::fs::Permissions::from_mode(0o600))?;
        }
        file.write_all(&data)?;
        file.as_file().sync_all()?;
        file.persist(path)?;
        Ok(())
    })();
    result.map_err(|error| format!("Could not save the MCP connections: {error}"))
}

#[tauri::command]
pub(crate) async fn mcp_read_connections(
    app: tauri::AppHandle,
) -> Result<Vec<StoredConnection>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_connections(&paths::data_dir(&app)?.join(FILE_NAME))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn mcp_save_connections(
    app: tauri::AppHandle,
    connections: Vec<StoredConnection>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_connections(&paths::data_dir(&app)?.join(FILE_NAME), &connections)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn restores_connections_and_persists_removal() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE_NAME);
        assert!(read_connections(&path).unwrap().is_empty());
        let saved = json!([
            { "id": "local", "name": "Local", "config": { "type": "stdio", "command": "node", "args": ["server.js"], "env": {"TOKEN": "example-secret"} } },
            { "id": "http", "name": "Remote", "config": { "type": "http", "url": "https://example.com/mcp", "headers": {"X-Token": "example-secret"} } }
        ]);
        let connections = serde_json::from_value::<Vec<StoredConnection>>(saved).unwrap();
        write_connections(&path, &connections).unwrap();
        let restored = read_connections(&path).unwrap();
        assert_eq!(
            serde_json::to_value(restored).unwrap(),
            serde_json::to_value(&connections).unwrap()
        );
        #[cfg(windows)]
        assert!(!std::fs::read(&path)
            .unwrap()
            .windows(b"example-secret".len())
            .any(|part| part == b"example-secret"));
        write_connections(&path, &connections[1..]).unwrap();
        assert_eq!(read_connections(&path).unwrap()[0].id, "http");
        write_connections(&path, &[]).unwrap();
        assert!(read_connections(&path).unwrap().is_empty());
    }
}
