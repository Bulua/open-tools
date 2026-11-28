//! 小红书分享页的后台读取：保留完整分享参数，由页面正常加载笔记数据。

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::Duration;
use crate::core::error::{api_result, ApiResult, AppError};
use tauri::{AppHandle, Url, WebviewUrl, WebviewWindowBuilder};

static COUNTER: AtomicU64 = AtomicU64::new(0);
const SCRIPT: &str = include_str!("xiaohongshu_capture.js");

fn allowed(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && matches!(
            url.host_str(),
            Some("www.xiaohongshu.com" | "xiaohongshu.com" | "xhslink.com" | "www.xhslink.com")
        )
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
}

#[tauri::command]
pub async fn xiaohongshu_capture(app: AppHandle, url: String) -> ApiResult<String> {
    let res: Result<String, String> = async {
        let url = Url::parse(&url).map_err(|_| "Invalid Xiaohongshu URL".to_string())?;
        if !allowed(&url) {
            return Err("Invalid Xiaohongshu URL".into());
        }
        let (tx, rx) = mpsc::channel::<String>();
        let label = format!(
            "xiaohongshu-capture-{}",
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
            .title("xiaohongshu")
            .user_agent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
            .initialization_script(SCRIPT)
            .visible(false)
            .inner_size(1280.0, 800.0);
        let builder = builder.skip_taskbar(true).focused(false);
        let window = builder
            .on_navigation(move |u: &Url| {
                if u.scheme() == "https" && u.host_str() == Some("open-tools.capture") {
                    if let Some((_, value)) = u.query_pairs().find(|(key, _)| key == "d") {
                        let _ = tx.send(value.into_owned());
                    }
                    return false;
                }
                allowed(u)
            })
            .build()
            .map_err(|e| format!("Can't open the Xiaohongshu page: {e}"))?;
        let result =
            tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(35)))
                .await;
        // 即使等待任务失败，也要清理隐藏窗口。
        let _ = window.destroy();
        result.map_err(|e| e.to_string())?.map_err(|_| {
            "Timed out reading the Xiaohongshu post. Check your network and try again".into()
        })
    }
    .await;
    api_result(res.map_err(AppError::from))
}
