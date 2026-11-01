//! AI 抠图模型：用户选择下载后保存在本机（应用数据目录下的 models 文件夹），之后离线使用。
//! 只允许下载下面列出的模型，地址和文件大小写在这里，前端只传模型 id，不能借此下载其他文件。

use std::path::PathBuf;
use std::time::Duration;

use tauri::ipc::Response;
use tauri::{AppHandle, Manager};

use crate::script::{run_powershell, TempDir};

const SCRIPT: &str = include_str!("download_model.ps1");
const BASE_URL: &str = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/";
/// 可下载的模型及文件大小（字节），用于计算进度和检查是否下载完整
const MODELS: &[(&str, u64)] = &[("silueta", 44_173_029), ("isnet-general-use", 178_648_008), ("u2net_human_seg", 175_997_641)];

fn expected_size(id: &str) -> Result<u64, String> {
    MODELS.iter().find(|(m, _)| *m == id).map(|(_, size)| *size).ok_or_else(|| format!("未知的模型：{id}"))
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建模型文件夹：{e}"))?;
    Ok(dir)
}

fn model_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    expected_size(id)?;
    Ok(models_dir(app)?.join(format!("{id}.onnx")))
}

fn part_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    expected_size(id)?;
    Ok(models_dir(app)?.join(format!("{id}.onnx.part")))
}

/// 已经下载完整的模型
#[tauri::command]
pub fn ai_models_downloaded(app: AppHandle) -> Vec<String> {
    MODELS
        .iter()
        .filter(|(id, size)| model_path(&app, id).ok().and_then(|p| std::fs::metadata(p).ok()).is_some_and(|m| m.len() == *size))
        .map(|(id, _)| id.to_string())
        .collect()
}

/// 下载模型（耗时较长，进度用 ai_model_progress 查询）
#[tauri::command]
pub async fn ai_model_download(app: AppHandle, id: String) -> Result<(), String> {
    let size = expected_size(&id)?;
    let target = model_path(&app, &id)?;
    let part = part_path(&app, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let dir = TempDir::new()?;
        let url = std::ffi::OsString::from(format!("{BASE_URL}{id}.onnx"));
        let out = run_powershell(
            &dir,
            SCRIPT,
            &[("OT_URL", url.as_os_str()), ("OT_OUT", part.as_os_str())],
            Duration::from_secs(3 * 3600),
            "下载超时，请检查网络后重试",
        );
        let downloaded = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        if downloaded != size {
            let _ = std::fs::remove_file(&part);
            let detail = out
                .ok()
                .and_then(|o| o.stdout.lines().find_map(|l| l.trim().strip_prefix("ERR:")).map(str::to_string))
                .unwrap_or_else(|| "文件不完整".into());
            return Err(format!("下载失败：{detail}"));
        }
        std::fs::rename(&part, &target).map_err(|e| format!("无法保存模型：{e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 正在下载的模型已经下载了多少字节
#[tauri::command]
pub fn ai_model_progress(app: AppHandle, id: String) -> u64 {
    part_path(&app, &id).ok().and_then(|p| std::fs::metadata(p).ok()).map(|m| m.len()).unwrap_or(0)
}

/// 读取已下载的模型文件
#[tauri::command]
pub async fn ai_model_read(app: AppHandle, id: String) -> Result<Response, String> {
    let path = model_path(&app, &id)?;
    let data = tauri::async_runtime::spawn_blocking(move || std::fs::read(path).map_err(|e| format!("无法读取模型：{e}")))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Response::new(data))
}

/// 删除已下载的模型，释放空间
#[tauri::command]
pub fn ai_model_delete(app: AppHandle, id: String) -> Result<(), String> {
    let path = model_path(&app, &id)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| format!("无法删除模型：{e}"))?;
    }
    Ok(())
}
