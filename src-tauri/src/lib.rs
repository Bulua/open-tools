mod document;
mod network;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 「另存为」/ 选择文件夹对话框与写文件，用于工具导出文件
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // 在线更新：检查、下载、安装新版本；安装后重启程序
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // 前端可以调用的命令
        .invoke_handler(tauri::generate_handler![
            network::ping_once,
            network::local_ip,
            document::office_engines,
            document::office_to_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
