//! 在本机运行 AI 模型（ONNX Runtime）。运行库随安装包自带（没有时和模型一起下载，见 ai_models.rs），第一次用到时加载。
//! 只用 CPU 多线程计算：DirectML（显卡）跑不了部分模型（如 LaMa 里的矩阵乘法会报错），各个模型统一用 CPU，结果稳定。
//! 前端负责预处理和后处理，这里只把输入张量（一个或多个，float32 或 uint8）交给模型，返回第一个输出。

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{LazyLock, Mutex, OnceLock};

use ort::environment::Environment;
use ort::session::{Session, SessionInputValue};
use ort::value::{DynTensor, Tensor};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::AppHandle;

use super::ai_models;

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

/// onnxruntime.dll 是带 DirectML 的版本，启动时要加载同一文件夹里的 DirectML.dll，而不是系统自带的旧版本
#[cfg(windows)]
fn allow_dlls_from(dir: &Path) {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::LibraryLoader::SetDllDirectoryW;
    let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        SetDllDirectoryW(wide.as_ptr());
    }
}

/// 加载模型，用 CPU 多线程计算
fn load(env: &Environment, path: &Path) -> Result<Session, String> {
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    Session::builder(env)
        .map_err(err)?
        .with_intra_threads(threads)
        .map_err(err)?
        .commit_from_file(path)
        .map_err(|e| format!("Can't load the model: {e}"))
}

/// 输入张量的数据：float32 或 uint8
enum Data {
    F32(Vec<f32>),
    U8(Vec<u8>),
}

fn to_tensor(shape: Vec<usize>, data: Data) -> Result<DynTensor, String> {
    Ok(match data {
        Data::F32(v) => Tensor::from_array((shape, v)).map_err(err)?.upcast(),
        Data::U8(v) => Tensor::from_array((shape, v)).map_err(err)?.upcast(),
    })
}

fn run(app: &AppHandle, id: &str, path: &Path, inputs: Vec<(Vec<usize>, Data)>) -> Result<Vec<u8>, String> {
    let env = environment(app)?;
    let mut sessions = SESSIONS.lock().map_err(err)?;
    let session = match sessions.entry(id.to_string()) {
        Entry::Occupied(e) => e.into_mut(),
        Entry::Vacant(e) => e.insert(load(env, path)?),
    };
    // 按模型输入的顺序依次传入
    let values = inputs
        .into_iter()
        .map(|(shape, data)| to_tensor(shape, data).map(SessionInputValue::from))
        .collect::<Result<Vec<_>, _>>()?;
    let outputs = session.run(values.as_slice()).map_err(|e| format!("The model failed to run: {e}"))?;
    // 输出是 float32 时按小端字节返回，是 uint8 时直接返回
    if let Ok((_, data)) = outputs[0].try_extract_tensor::<f32>() {
        return Ok(data.iter().flat_map(|v| v.to_le_bytes()).collect());
    }
    let (_, data) = outputs[0].try_extract_tensor::<u8>().map_err(err)?;
    Ok(data.to_vec())
}

/// 解析张量形状，如 1,3,320,320
fn parse_shape(text: &str) -> Result<Vec<usize>, String> {
    text.split(',').map(|s| s.trim().parse::<usize>()).collect::<Result<Vec<_>, _>>().map_err(|_| "Invalid input shape".into())
}

/// 按各个形状把请求体切成多个输入张量
fn split_inputs(bytes: &[u8], shapes: Vec<Vec<usize>>, uint8: bool) -> Result<Vec<(Vec<usize>, Data)>, String> {
    let width = if uint8 { 1 } else { 4 };
    if bytes.len() != shapes.iter().map(|s| s.iter().product::<usize>() * width).sum::<usize>() {
        return Err("The input size doesn't match its shape".into());
    }
    let mut rest = bytes;
    let mut inputs = Vec::with_capacity(shapes.len());
    for shape in shapes {
        let (chunk, tail) = rest.split_at(shape.iter().product::<usize>() * width);
        rest = tail;
        let data = if uint8 {
            Data::U8(chunk.to_vec())
        } else {
            Data::F32(chunk.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect())
        };
        inputs.push((shape, data));
    }
    Ok(inputs)
}

/// 运行模型。请求体是输入张量的数据（多个输入时依次拼接），请求头：
/// x-model 是模型 id；x-shape 是张量形状（如 1,3,320,320），多个输入用分号隔开；
/// x-dtype 是输入的数据类型，f32（默认，小端字节）或 u8。
/// 返回第一个输出（float32 小端字节，或 uint8）
#[tauri::command]
pub async fn ai_run(app: AppHandle, request: Request<'_>) -> Result<Response, String> {
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let id = header("x-model").ok_or("Missing the model id")?;
    let shapes = header("x-shape").ok_or("Missing the input shape")?.split(';').map(parse_shape).collect::<Result<Vec<_>, _>>()?;
    let uint8 = match header("x-dtype").as_deref() {
        None | Some("f32") => false,
        Some("u8") => true,
        Some(other) => return Err(format!("Unsupported input type: {other}")),
    };
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The input must be binary data".into());
    };
    let inputs = split_inputs(bytes, shapes, uint8)?;
    let path = ai_models::model_path(&app, &id)?;
    tauri::async_runtime::spawn_blocking(move || run(&app, &id, &path, inputs))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_inputs_by_shape() {
        let bytes: Vec<u8> = [1.0f32, 2.0, 3.0].iter().flat_map(|v| v.to_le_bytes()).collect();
        let inputs = split_inputs(&bytes, vec![vec![1, 2], vec![1]], false).unwrap();
        assert!(matches!(&inputs[0].1, Data::F32(v) if v == &[1.0, 2.0]));
        assert!(matches!(&inputs[1].1, Data::F32(v) if v == &[3.0]));
        let inputs = split_inputs(&[1, 2, 3], vec![vec![2], vec![1]], true).unwrap();
        assert!(matches!(&inputs[1].1, Data::U8(v) if v == &[3]));
        assert!(split_inputs(&[1, 2, 3], vec![vec![2]], true).is_err());
        assert!(parse_shape("1, 3,x").is_err());
    }
}
