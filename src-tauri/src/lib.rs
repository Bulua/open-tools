mod ai_models;
mod branding;
mod document;
mod douyin;
mod hdr;
mod inference;
mod network;
mod paths;
mod script;
mod tray;
mod tts;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 必须最先注册：再次打开程序时显示已有窗口，而不是启动第二个
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        // 「另存为」/ 选择文件夹对话框与写文件，用于工具导出文件
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // 在线更新：检查、下载、安装新版本；安装后重启程序
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // 用系统默认浏览器打开网址
        .plugin(tauri_plugin_opener::init())
        // HTTP 请求工具：由 Rust 发出请求
        .plugin(tauri_plugin_http::init())
        // 前端可以调用的命令
        .invoke_handler(tauri::generate_handler![
            network::ping_once,
            network::local_ip,
            document::office_engines,
            document::office_to_pdf,
            document::pdf_to_word,
            douyin::douyin_capture,
            tts::tts_voices,
            tts::tts_synthesize,
            ai_models::ai_status,
            ai_models::ai_model_download,
            ai_models::ai_model_progress,
            ai_models::ai_model_delete,
            inference::ai_run,
            vault::vault_read,
            vault::vault_write,
            hdr::hdr_enabled,
            hdr::hdr_disable,
            hdr::hdr_restore,
            branding::branding_current,
            branding::branding_logo,
            branding::branding_activate,
            tray::set_tray_text
        ])
        // 关闭窗口时隐藏到托盘，从托盘菜单退出
        .setup(|app| {
            // 旧版本放在别处的数据（密码本、模型、图标）搬进数据文件夹，要在读取这些数据之前
            paths::migrate(app.handle());
            tray::setup(app)?;
            // 换上之前从 Gitee / GitHub 下载的图标（见 branding.rs）
            branding::apply_cached(app.handle());
            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_, event| {
            // 退出时恢复录屏前临时关闭的 HDR
            if let tauri::RunEvent::Exit = event {
                hdr::restore();
            }
        });
}
