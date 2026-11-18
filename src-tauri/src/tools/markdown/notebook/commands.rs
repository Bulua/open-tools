//! 笔记本文件只存放在应用数据目录，前端不能指定磁盘路径。
use std::{fs, io::Write, path::Path};
use tauri::AppHandle;

#[tauri::command]
pub async fn notebook_read(app: AppHandle) -> Result<Option<String>, String> {
    let path = crate::core::paths::sub_dir(&app, "notebook")?.join("notebook.json");
    match fs::read_to_string(path) {
        Ok(data) => Ok(Some(data)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read the notebook: {error}")),
    }
}

#[tauri::command]
pub async fn notebook_write(app: AppHandle, data: String) -> Result<(), String> {
    let dir = crate::core::paths::sub_dir(&app, "notebook")?;
    write_snapshot(&dir, &data).map_err(|error| format!("Failed to save the notebook: {error}"))
}

fn write_snapshot(dir: &Path, data: &str) -> std::io::Result<()> {
    // 同目录原子替换，不让中途退出覆盖上一次完整保存。
    let mut temp = tempfile::NamedTempFile::new_in(dir)?;
    temp.write_all(data.as_bytes())?;
    temp.as_file().sync_all()?;
    temp.persist(dir.join("notebook.json"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_the_previous_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        write_snapshot(dir.path(), r#"{"nodes":[]}"#).unwrap();
        let updated = r##"{"nodes":[{"markdown":"# 笔记"}]}"##;
        write_snapshot(dir.path(), updated).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("notebook.json")).unwrap(),
            updated
        );
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
