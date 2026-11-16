mod core;
mod tools;

use crate::core::{branding, paths, tray};
use crate::tools::{
    audio::tts::commands as tts,
    document::{
        large_file::{commands as large_file, service as large_file_service},
        pdf_to_word::commands as pdf_to_word,
        shared::office,
        word_to_pdf::commands as word_to_pdf,
    },
    encode::password_vault::commands as vault,
    image::shared::{ai_models, inference},
    network::{ip_lookup::commands as ip_lookup, ping::commands as ping},
    utility::{calendar::commands as calendar, clock::commands as clock},
    video::{
        douyin_download::commands as douyin,
        shared::{hdr, storage},
        xiaohongshu_download::commands as xiaohongshu,
    },
};
#[cfg(windows)]
use crate::tools::{
    document::pdf_content_editor::commands as pdf_content_editor,
    encode::clipboard_history::commands as clipboard,
    image::screenshot_history::{commands as screenshot, windows as screenshot_windows},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder
        // 必须最先注册：再次打开程序时显示已有窗口，而不是启动第二个
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main(app)
        }));

    let builder = builder
        // 「另存为」/ 选择文件夹对话框与写文件，用于工具导出文件
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // 用系统默认浏览器打开网址
        .plugin(tauri_plugin_opener::init())
        // HTTP 请求工具：由 Rust 发出请求
        .plugin(tauri_plugin_http::init());

    #[cfg(desktop)]
    let builder = builder
        // 在线更新：检查、下载、安装新版本；安装后重启程序
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());

    let builder = builder
        // 前端可以调用的命令
        .invoke_handler(tauri::generate_handler![
            #[cfg(windows)]
            pdf_content_editor::pdf_system_fonts,
            #[cfg(windows)]
            pdf_content_editor::pdf_system_font_read,
            large_file::large_text_open,
            large_file::large_text_read,
            large_file::large_text_edit,
            large_file::large_text_history,
            large_file::large_text_jump,
            large_file::large_text_search,
            large_file::large_text_save,
            large_file::large_text_status,
            large_file::large_text_pending,
            large_file::large_text_cancel,
            large_file::large_text_close,
            large_file::large_text_exit,
            ping::ping_once,
            ip_lookup::local_ip,
            office::office_engines,
            word_to_pdf::office_to_pdf,
            pdf_to_word::pdf_to_word,
            douyin::douyin_capture,
            storage::video_download_dir,
            xiaohongshu::xiaohongshu_capture,
            tts::tts_voices,
            tts::tts_synthesize,
            ai_models::ai_status,
            ai_models::ai_model_download,
            ai_models::ai_model_progress,
            ai_models::ai_model_delete,
            inference::ai_run,
            vault::vault_read,
            vault::vault_write,
            clock::countdown_read,
            clock::countdown_write,
            calendar::calendar_read,
            calendar::calendar_write,
            #[cfg(windows)]
            calendar::calendar_wait,
            #[cfg(windows)]
            calendar::calendar_wake,
            #[cfg(windows)]
            calendar::calendar_notify,
            #[cfg(windows)]
            core::notifications::desktop_notify,
            hdr::hdr_enabled,
            hdr::hdr_disable,
            hdr::hdr_restore,
            branding::branding_current,
            branding::branding_logo,
            branding::branding_activate,
            tray::set_tray_text,
            #[cfg(windows)]
            clipboard::clipboard_history_list,
            #[cfg(windows)]
            clipboard::clipboard_history_update,
            #[cfg(windows)]
            clipboard::clipboard_history_copy,
            #[cfg(windows)]
            clipboard::clipboard_history_open,
            #[cfg(windows)]
            clipboard::clipboard_copy_private,
            #[cfg(windows)]
            screenshot::screenshot_begin,
            #[cfg(windows)]
            screenshot::screenshot_prepare,
            #[cfg(windows)]
            screenshot::screenshot_active,
            #[cfg(windows)]
            screenshot::screenshot_show,
            #[cfg(windows)]
            screenshot::screenshot_capture,
            #[cfg(windows)]
            screenshot::screenshot_targets,
            #[cfg(windows)]
            screenshot::screenshot_finish,
            #[cfg(windows)]
            screenshot::screenshot_cancel,
            #[cfg(windows)]
            screenshot::screenshot_list,
            #[cfg(windows)]
            screenshot::screenshot_read,
            #[cfg(windows)]
            screenshot::screenshot_delete,
            #[cfg(windows)]
            screenshot::screenshot_pin,
            #[cfg(windows)]
            screenshot::screenshot_reveal
        ])
        // 关闭窗口时隐藏到托盘，从托盘菜单退出
        .setup(|app| {
            // 旧版本放在别处的数据（密码本、模型、图标）搬进数据文件夹，要在读取这些数据之前
            paths::migrate(app.handle());
            #[cfg(windows)]
            clipboard::start(app.handle());
            #[cfg(desktop)]
            tray::setup(
                app,
                #[cfg(windows)]
                |app, toggle| {
                    if toggle {
                        clipboard::toggle(app)
                    } else {
                        clipboard::open(app)
                    }
                },
            )?;
            // 换上之前从 Gitee / GitHub 下载的图标（见 branding.rs）
            branding::apply_cached(app.handle());
            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder.on_window_event(|window, event| {
        tray::on_window_event(window, event);
        #[cfg(windows)]
        screenshot_windows::on_window_event(window, event);
    });

    builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = &event {
                if large_file_service::has_sessions() {
                    api.prevent_exit();
                    #[cfg(desktop)]
                    tray::show_main(app);
                    use tauri::Emitter;
                    let _ = app.emit_to("main", "large-text-exit-requested", code);
                }
            }
            // 退出时恢复录屏前临时关闭的 HDR
            if let tauri::RunEvent::Exit = event {
                large_file_service::shutdown();
                hdr::restore();
            }
        });
}
