//! 抖音作品信息：抖音的接口需要由页面脚本计算的签名，直接请求拿不到数据。
//! 这里开一个用户看不到的窗口（放在屏幕外）正常打开作品页，让页面自己加载数据；
//! 注入的脚本（douyin_capture.js）读到作品信息后跳转到 https://open-tools.capture/?d=…，
//! 由 on_navigation 截获并取消这次跳转。外部页面不需要、也拿不到程序的 IPC 权限。

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use tauri::{AppHandle, Url, WebviewUrl, WebviewWindowBuilder};

const SCRIPT: &str = include_str!("douyin_capture.js");
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
/// 页面加载、读取数据的最长时间（注入的脚本 25 秒后会报告没有数据）
const TIMEOUT: Duration = Duration::from_secs(35);

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// 读取抖音作品信息，返回 JSON 字符串（字段见 douyin_capture.js 的 pick）。
/// id 是作品编号（纯数字），kind 是 video 或 note（图文）
#[tauri::command]
pub async fn douyin_capture(app: AppHandle, id: String, kind: String) -> Result<String, String> {
    if id.is_empty() || id.len() > 24 || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("作品编号不正确".into());
    }
    let path = if kind == "note" { "note" } else { "video" };
    let url: Url = format!("https://www.douyin.com/{path}/{id}").parse().map_err(|e| format!("{e}"))?;

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let label = format!("douyin-capture-{}", COUNTER.fetch_add(1, Ordering::Relaxed));
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .title("douyin")
        .user_agent(UA)
        .initialization_script(SCRIPT)
        // 放在屏幕外而不是隐藏：隐藏的页面会被浏览器降低执行频率，有的页面不加载内容
        .position(-32000.0, -32000.0)
        .inner_size(1280.0, 800.0)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .on_navigation(move |u: &Url| {
            if u.host_str() != Some("open-tools.capture") {
                return true;
            }
            let pair = u.query_pairs().next();
            let result = match pair {
                Some((k, v)) if k == "d" => Ok(v.into_owned()),
                Some((k, v)) if k == "e" && v == "captcha" => Err("抖音要求进行安全验证，请稍后再试".to_string()),
                _ => Err("没有读到作品信息：作品可能已删除、设为私密，或者抖音页面有变化".to_string()),
            };
            let _ = tx.send(result);
            false
        })
        .build()
        .map_err(|e| format!("无法打开抖音页面：{e}"))?;

    let result = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(TIMEOUT))
        .await
        .map_err(|e| e.to_string())?;
    let _ = window.destroy();
    match result {
        Ok(r) => r,
        Err(_) => Err("读取作品信息超时，请检查网络后再试".into()),
    }
}
