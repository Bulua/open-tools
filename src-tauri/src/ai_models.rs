//! AI 模型与运行环境（ONNX Runtime）的下载和管理。
//! 用户选择下载后保存在数据文件夹（见 paths.rs）的 models、runtime 里，之后离线使用。
//! 只允许下载下面列出的文件，地址、大小、校验值写在这里，前端只传模型 id，不能借此下载其他文件。
//! 每个文件在国内（魔搭 ModelScope）和国外（Hugging Face）各放一份，一个下载失败时自动换另一个。
//! 运行环境不单独安装：下载模型时，运行环境缺少的文件一起下载。
//! 托管仓库里的文件和下面的大小、校验值用 scripts/prepare-ai-files.ps1 准备。

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};
use tauri_plugin_http::reqwest;

use crate::paths;

/// 一个可下载的文件
struct RemoteFile {
    /// 在托管仓库里的路径
    path: &'static str,
    /// 大小（字节）；为 0 时以服务器返回的大小为准
    size: u64,
    /// SHA-256（小写十六进制）；为空时只检查大小
    sha256: &'static str,
}

impl RemoteFile {
    /// 保存到本机时的文件名
    fn name(&self) -> &'static str {
        self.path.rsplit('/').next().unwrap_or(self.path)
    }
}

/// 下载源：id 与仓库地址（后面接 RemoteFile.path）。默认按这个顺序尝试
const SOURCES: &[(&str, &str)] = &[
    ("modelscope", "https://modelscope.cn/models/Bulua/open-tools-models/resolve/master/"),
    ("huggingface", "https://huggingface.co/Bulua/open-tools-models/resolve/main/"),
];

/// 可下载的模型（来自开源项目 rembg）
const MODELS: &[(&str, RemoteFile)] = &[
    ("u2netp", RemoteFile { path: "models/u2netp.onnx", size: 4_574_861, sha256: "" }),
    ("silueta", RemoteFile { path: "models/silueta.onnx", size: 44_173_029, sha256: "" }),
    ("isnet-general-use", RemoteFile { path: "models/isnet-general-use.onnx", size: 178_648_008, sha256: "" }),
    ("u2net_human_seg", RemoteFile { path: "models/u2net_human_seg.onnx", size: 175_997_641, sha256: "" }),
];

/// 运行环境的版本：换版本时改这里，新版本下载到新的文件夹，旧模型不受影响
const RUNTIME_VERSION: &str = "1.31.0";

/// 运行环境的文件：ONNX Runtime（带 DirectML 显卡加速）及其依赖的 DirectML
#[cfg(windows)]
const RUNTIME_FILES: &[RemoteFile] = &[
    RemoteFile { path: "runtime/1.31.0/win-x64/onnxruntime.dll", size: 0, sha256: "" },
    RemoteFile { path: "runtime/1.31.0/win-x64/DirectML.dll", size: 0, sha256: "" },
];
/// 其他平台以后再加
#[cfg(not(windows))]
const RUNTIME_FILES: &[RemoteFile] = &[];

/// 运行环境的主文件，加载它来运行模型
#[cfg(windows)]
pub const RUNTIME_LIB: &str = "onnxruntime.dll";
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub const RUNTIME_LIB: &str = "libonnxruntime.dylib";
#[cfg(not(any(windows, target_os = "macos", target_os = "ios")))]
pub const RUNTIME_LIB: &str = "libonnxruntime.so";

fn model_file(id: &str) -> Result<&'static RemoteFile, String> {
    MODELS.iter().find(|(m, _)| *m == id).map(|(_, f)| f).ok_or_else(|| format!("Unknown model: {id}"))
}

fn models_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    paths::sub_dir(app, "models")
}

/// 运行环境所在的文件夹
pub fn runtime_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = paths::sub_dir(app, "runtime")?.join(RUNTIME_VERSION);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Can't create the runtime folder: {e}"))?;
    Ok(dir)
}

/// 文件已经下载完整（只比较大小，不重新计算校验值）
fn complete(path: &Path, file: &RemoteFile) -> bool {
    std::fs::metadata(path).is_ok_and(|m| m.is_file() && (file.size == 0 || m.len() == file.size))
}

/// 运行环境缺少的文件及保存位置
fn missing_runtime<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<(&'static RemoteFile, PathBuf)>, String> {
    let dir = runtime_dir(app)?;
    Ok(RUNTIME_FILES.iter().map(|f| (f, dir.join(f.name()))).filter(|(f, p)| !complete(p, f)).collect())
}

pub fn runtime_ready<R: Runtime>(app: &AppHandle<R>) -> bool {
    missing_runtime(app).is_ok_and(|m| m.is_empty())
}

/// 已经下载好的模型文件；没有下载时报错
pub fn model_path<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<PathBuf, String> {
    let file = model_file(id)?;
    let path = models_dir(app)?.join(file.name());
    if complete(&path, file) {
        Ok(path)
    } else {
        Err(format!("The model {id} isn't downloaded yet"))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    /// 已经下载完整的模型
    models: Vec<String>,
    /// 运行环境是否已经下载好
    runtime_ready: bool,
    /// 运行环境还要下载的大小（字节，大小未知的文件不计入）
    runtime_size: u64,
    /// 数据保存的位置，显示给用户
    dir: String,
}

/// 模型和运行环境的下载情况
#[tauri::command]
pub fn ai_status(app: AppHandle) -> Result<AiStatus, String> {
    let dir = models_dir(&app)?;
    let models = MODELS.iter().filter(|(_, f)| complete(&dir.join(f.name()), f)).map(|(id, _)| id.to_string()).collect();
    let missing = missing_runtime(&app)?;
    Ok(AiStatus {
        models,
        runtime_ready: missing.is_empty(),
        runtime_size: missing.iter().map(|(f, _)| f.size).sum(),
        dir: paths::data_dir(&app)?.to_string_lossy().into_owned(),
    })
}

// ---------- 下载 ----------

#[derive(Clone, Copy, Default, Serialize)]
pub struct Progress {
    /// 已下载的字节数
    done: u64,
    /// 一共要下载的字节数
    total: u64,
}

/// 正在下载的模型及进度，前端定时查询
static PROGRESS: LazyLock<Mutex<HashMap<String, Progress>>> = LazyLock::new(Default::default);
/// 同一时间只下载一个模型，避免两个模型同时下载运行环境时写同一个文件
static DOWNLOADING: LazyLock<tauri::async_runtime::Mutex<()>> = LazyLock::new(Default::default);

/// 记录一个模型的下载进度：之前的文件已下载 finished 字节，正在下载的文件已下载 current 字节
struct Tracker {
    id: String,
    finished: u64,
    current: u64,
    total: u64,
}

impl Tracker {
    fn publish(&self) {
        if let Ok(mut map) = PROGRESS.lock() {
            map.insert(self.id.clone(), Progress { done: self.finished + self.current, total: self.total });
        }
    }
    fn set_current(&mut self, bytes: u64) {
        self.current = bytes;
        self.publish();
    }
    fn finish_file(&mut self) {
        self.finished += self.current;
        self.current = 0;
        self.publish();
    }
}

/// 按用户选择的下载源排在最前面，其他下载源作为备用；没有选择或选择了未知的下载源时按默认顺序
fn source_order(preferred: Option<&str>) -> Vec<&'static str> {
    let mut list = SOURCES.to_vec();
    if let Some(p) = preferred {
        list.sort_by_key(|(id, _)| *id != p);
    }
    list.into_iter().map(|(_, url)| url).collect()
}

/// 下载模型；运行环境缺少的文件一起下载。耗时较长，进度用 ai_model_progress 查询
#[tauri::command]
pub async fn ai_model_download(app: AppHandle, id: String, source: Option<String>) -> Result<(), String> {
    let model = model_file(&id)?;
    let mut tracker = Tracker { id: id.clone(), finished: 0, current: 0, total: 0 };
    tracker.publish();
    let _lock = DOWNLOADING.lock().await;

    let mut jobs = missing_runtime(&app)?;
    let target = models_dir(&app)?.join(model.name());
    if !complete(&target, model) {
        jobs.push((model, target));
    }
    tracker.total = jobs.iter().map(|(f, _)| f.size).sum();
    tracker.publish();

    let sources = source_order(source.as_deref());
    let result = async {
        let client = reqwest::Client::builder()
            .user_agent("OpenTools")
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;
        for (file, target) in jobs {
            download_file(&client, file, &target, &sources, &mut tracker).await?;
        }
        Ok::<(), String>(())
    }
    .await;
    if let Ok(mut map) = PROGRESS.lock() {
        map.remove(&id);
    }
    result
}

/// 依次尝试各个下载源，下载并校验一个文件
async fn download_file(client: &reqwest::Client, file: &RemoteFile, target: &Path, sources: &[&str], tracker: &mut Tracker) -> Result<(), String> {
    let part = target.with_file_name(format!("{}.part", file.name()));
    let mut last_error = String::new();
    for base in sources {
        let url = format!("{base}{}", file.path);
        let result = match fetch(client, &url, &part, file, tracker).await {
            Ok(()) => verify(&part, file),
            Err(e) => Err(e),
        };
        match result {
            Ok(()) => {
                std::fs::rename(&part, target).map_err(|e| format!("Can't save {}: {e}", file.name()))?;
                tracker.finish_file();
                return Ok(());
            }
            Err(e) => last_error = e,
        }
    }
    tracker.set_current(0);
    Err(format!("Download failed: {last_error}"))
}

/// 下载到 part 文件；part 已有一部分时从断点继续（服务器不支持时从头下载）
async fn fetch(client: &reqwest::Client, url: &str, part: &Path, file: &RemoteFile, tracker: &mut Tracker) -> Result<(), String> {
    let mut have = std::fs::metadata(part).map(|m| m.len()).unwrap_or(0);
    if file.size > 0 && have >= file.size {
        if have == file.size {
            tracker.set_current(have);
            return Ok(());
        }
        let _ = std::fs::remove_file(part);
        have = 0;
    }
    let mut request = client.get(url);
    if have > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={have}-"));
    }
    let mut response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    let resume = have > 0 && status == reqwest::StatusCode::PARTIAL_CONTENT;
    if !resume {
        have = 0;
    }
    // 大小未知的文件，按服务器返回的大小计算进度
    if file.size == 0 {
        if let Some(len) = response.content_length() {
            tracker.total += have + len;
        }
    }
    let mut out = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resume)
        .truncate(!resume)
        .open(part)
        .map_err(|e| format!("Can't save {}: {e}", file.name()))?;
    tracker.set_current(have);
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        out.write_all(&chunk).map_err(|e| format!("Can't save {}: {e}", file.name()))?;
        have += chunk.len() as u64;
        tracker.set_current(have);
    }
    out.flush().map_err(|e| format!("Can't save {}: {e}", file.name()))
}

/// 检查大小和校验值。不完整时保留 part 文件，换下载源后接着下载；校验值不对时删除重新下载
fn verify(part: &Path, file: &RemoteFile) -> Result<(), String> {
    let len = std::fs::metadata(part).map(|m| m.len()).unwrap_or(0);
    if file.size > 0 && len != file.size {
        return Err("The file is incomplete".into());
    }
    if !file.sha256.is_empty() && sha256_of(part)? != file.sha256 {
        let _ = std::fs::remove_file(part);
        return Err("The file is damaged (checksum mismatch)".into());
    }
    Ok(())
}

fn sha256_of(path: &Path) -> Result<String, String> {
    let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// 正在下载的模型的进度；没有在下载时都是 0
#[tauri::command]
pub fn ai_model_progress(id: String) -> Progress {
    PROGRESS.lock().ok().and_then(|map| map.get(&id).copied()).unwrap_or_default()
}

/// 删除已下载的模型，释放空间（运行环境保留，其他模型还要用）
#[tauri::command]
pub fn ai_model_delete(app: AppHandle, id: String) -> Result<(), String> {
    let file = model_file(&id)?;
    // 先释放已加载的模型，否则文件可能被占用删不掉
    crate::inference::unload(&id);
    let path = models_dir(&app)?.join(file.name());
    let _ = std::fs::remove_file(path.with_file_name(format!("{}.part", file.name())));
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| format!("Can't delete the model: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preferred_source_comes_first() {
        let default: Vec<_> = SOURCES.iter().map(|(_, url)| *url).collect();
        assert_eq!(source_order(None), default);
        assert_eq!(source_order(Some("unknown")), default);
        let hf = source_order(Some("huggingface"));
        assert!(hf[0].contains("huggingface.co"));
        assert_eq!(hf.len(), SOURCES.len());
    }

    #[test]
    fn catalog_is_consistent() {
        for (_, f) in MODELS {
            assert!(f.path.starts_with("models/"));
        }
        for f in RUNTIME_FILES {
            assert!(f.path.starts_with(&format!("runtime/{RUNTIME_VERSION}/")));
        }
    }
}
