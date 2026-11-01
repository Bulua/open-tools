mod document;
mod network;
mod script;
mod tray;
mod tts;

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
        // 前端可以调用的命令
        .invoke_handler(tauri::generate_handler![
            network::ping_once,
            network::local_ip,
            document::office_engines,
            document::office_to_pdf,
            tts::tts_voices,
            tts::tts_synthesize
        ])
        // 关闭窗口时隐藏到托盘，从托盘菜单退出
        .setup(|app| {
            tray::setup(app)?;
            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
