//! 系统托盘：点击窗口右上角的关闭按钮时隐藏到任务栏右下角的托盘，不退出程序。
//! 单击托盘图标重新显示窗口；右键菜单可以显示窗口或退出。
//! 菜单文字由前端按界面语言传过来（set_tray_text），启动时先显示中文。

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, Runtime, Window, WindowEvent};

/// 显示并聚焦主窗口（从托盘恢复、再次打开程序时调用）
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 托盘右键菜单
fn build_menu<R: Runtime, M: Manager<R>>(
    manager: &M,
    show: &str,
    quit: &str,
    #[cfg(windows)] clipboard: &str,
    #[cfg(windows)] clipboard_toggle: &str,
) -> tauri::Result<Menu<R>> {
    let show = MenuItem::with_id(manager, "show", show, true, None::<&str>)?;
    let quit = MenuItem::with_id(manager, "quit", quit, true, None::<&str>)?;
    #[cfg(windows)]
    {
        let clipboard = MenuItem::with_id(manager, "clipboard", clipboard, true, None::<&str>)?;
        let toggle = MenuItem::with_id(manager, "clipboard-toggle", clipboard_toggle, true, None::<&str>)?;
        return Menu::with_items(manager, &[&show, &clipboard, &toggle, &quit]);
    }
    #[cfg(not(windows))]
    Menu::with_items(manager, &[&show, &quit])
}

pub fn setup<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let menu = build_menu(
        app, "显示主窗口", "退出",
        #[cfg(windows)] "剪贴板历史",
        #[cfg(windows)] "暂停或恢复剪贴板记录",
    )?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Open Tools 工具百宝箱")
        .menu(&menu)
        // 左键单击显示窗口，右键才弹出菜单
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            #[cfg(windows)]
            id @ ("clipboard" | "clipboard-toggle") => {
                let app = app.clone();
                let toggle = id == "clipboard-toggle";
                tauri::async_runtime::spawn_blocking(move || {
                    let result = if toggle {
                        crate::tools::text::clipboard::toggle(&app)
                    } else {
                        crate::tools::text::clipboard::open(&app)
                    };
                    if let Err(error) = result {
                        use tauri::Emitter;
                        show_main(&app);
                        let _ = app.emit_to("main", "clipboard-history-tray-error", error);
                    }
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// 前端切换界面语言时调用：换上当前语言的菜单文字和鼠标悬停提示
#[tauri::command]
pub fn set_tray_text(
    app: AppHandle,
    show: String,
    quit: String,
    tooltip: String,
    clipboard: Option<String>,
    clipboard_toggle: Option<String>,
) -> Result<(), String> {
    #[cfg(not(windows))]
    let _ = (clipboard, clipboard_toggle);
    let Some(tray) = app.tray_by_id("main") else { return Ok(()) };
    let menu = build_menu(
        &app, &show, &quit,
        #[cfg(windows)] clipboard.as_deref().unwrap_or("剪贴板历史"),
        #[cfg(windows)] clipboard_toggle.as_deref().unwrap_or("暂停或恢复剪贴板记录"),
    ).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())
}

/// 关闭主窗口时改为隐藏
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}
