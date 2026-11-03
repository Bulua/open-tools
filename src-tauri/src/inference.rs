//! 在本机运行 AI 模型（ONNX Runtime）。运行库是和模型一起下载的（见 ai_models.rs），第一次用到时加载。
//! Windows 上优先用 DirectML 调用显卡（N 卡、A 卡、核显都可以），不行时用 CPU 多线程计算。
//! 前端负责预处理和后处理，这里只把输入张量交给模型，返回第一个输出。

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{LazyLock, Mutex, OnceLock};

use ort::environment::Environment;
use ort::session::Session;
use ort::value::Tensor;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::AppHandle;

use crate::ai_models;

static ENV: OnceLock<Environment> = OnceLock::new();
/// 加载运行库时加锁，避免两次识别同时初始化
static INIT: Mutex<()> = Mutex::new(());
/// 已加载的模型，按模型 id；再次识别时不用重新加载
static SESSIONS: LazyLock<Mutex<HashMap<String, Session>>> = LazyLock::new(Default::default);

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// 加载运行库（只加载一次）
fn environment(app: &AppHandle) -> Result<&'static Environment, String> {
    let _guard = INIT.lock().map_err(err)?;
    if let Some(env) = ENV.get() {
        return Ok(env);
    }
    if !ai_models::runtime_ready(app) {
        return Err("The AI runtime isn't downloaded yet".into());
    }
    let dir = ai_models::runtime_dir(app)?;
    #[cfg(windows)]
    allow_dlls_from(&dir);
    let env = ort::init_from(dir.join(ai_models::RUNTIME_LIB))
        .map_err(|e| format!("Can't load the AI runtime: {e}"))?
        .build()
        .map_err(|e| format!("Can't start the AI runtime: {e}"))?;
    Ok(ENV.get_or_init(|| env))
}

/// onnxruntime.dll 要加载同一文件夹里的 DirectML.dll，而不是系统自带的旧版本
#[cfg(windows)]
fn allow_dlls_from(dir: &Path) {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::LibraryLoader::SetDllDirectoryW;
    let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        SetDllDirectoryW(wide.as_ptr());
    }
}

/// 加载模型：先试显卡，失败时用 CPU
fn load(env: &Environment, path: &Path) -> Result<Session, String> {
    #[cfg(windows)]
    if let Ok(session) = build(env, path, true) {
        return Ok(session);
    }
    build(env, path, false)
}

fn build(env: &Environment, path: &Path, gpu: bool) -> Result<Session, String> {
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let mut builder = Session::builder(env).map_err(err)?.with_intra_threads(threads).map_err(err)?;
    #[cfg(windows)]
    if gpu {
        // DirectML 不支持内存复用优化和并行执行（并行执行默认关闭）
        builder = builder
            .with_memory_pattern(false)
            .map_err(err)?
            .with_execution_providers([ort::ep::DirectML::default().build()])
            .map_err(err)?;
    }
    #[cfg(not(windows))]
    let _ = gpu;
    builder.commit_from_file(path).map_err(|e| format!("Can't load the model: {e}"))
}

fn run(app: &AppHandle, id: &str, path: &Path, shape: Vec<usize>, input: Vec<f32>) -> Result<Vec<u8>, String> {
    let env = environment(app)?;
    let mut sessions = SESSIONS.lock().map_err(err)?;
    let session = match sessions.entry(id.to_string()) {
        Entry::Occupied(e) => e.into_mut(),
        Entry::Vacant(e) => e.insert(load(env, path)?),
    };
    let tensor = Tensor::from_array((shape, input)).map_err(err)?;
    let outputs = session.run(ort::inputs![tensor]).map_err(|e| format!("The model failed to run: {e}"))?;
    let (_, data) = outputs[0].try_extract_tensor::<f32>().map_err(err)?;
    Ok(data.iter().flat_map(|v| v.to_le_bytes()).collect())
}

/// 运行模型。请求体是 float32 输入张量（小端字节），请求头 x-model 是模型 id，x-shape 是张量形状（如 1,3,320,320）；
/// 返回第一个输出（float32 小端字节）
#[tauri::command]
pub async fn ai_run(app: AppHandle, request: Request<'_>) -> Result<Response, String> {
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let id = header("x-model").ok_or("Missing the model id")?;
    let shape = header("x-shape")
        .ok_or("Missing the input shape")?
        .split(',')
        .map(|s| s.trim().parse::<usize>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Invalid input shape")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The input must be binary data".into());
    };
    if bytes.len() != shape.iter().product::<usize>() * 4 {
        return Err("The input size doesn't match its shape".into());
    }
    let input: Vec<f32> = bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
    let path = ai_models::model_path(&app, &id)?;
    tauri::async_runtime::spawn_blocking(move || run(&app, &id, &path, shape, input))
        .await
        .map_err(err)?
        .map(Response::new)
}

/// 释放已加载的模型（删除模型文件前调用）
pub fn unload(id: &str) {
    if let Ok(mut sessions) = SESSIONS.lock() {
        sessions.remove(id);
    }
}
