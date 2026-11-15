//! 屏幕 HDR 开关：屏幕开着 HDR 时，浏览器截屏的亮度会被放大、浅色变成纯白，录出来整体发白。
//! 录屏前临时关闭 HDR，录完再打开；只恢复被我们关掉的屏幕，不改动用户原本关着的。
//! 使用 Windows 的显示设置接口（QueryDisplayConfig / DisplayConfigSetDeviceInfo），其他系统上不做任何事。

#[cfg(windows)]
mod imp {
    use std::mem::size_of;
    use std::sync::Mutex;

    use windows_sys::Win32::Devices::Display::{
        DisplayConfigGetDeviceInfo, DisplayConfigSetDeviceInfo, GetDisplayConfigBufferSizes,
        QueryDisplayConfig, DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO,
        DISPLAYCONFIG_DEVICE_INFO_HEADER, DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE,
        DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO,
        DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE, QDC_ONLY_ACTIVE_PATHS,
    };
    use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS, LUID};

    /// 一块屏幕：显卡 + 输出口
    #[derive(Clone, Copy)]
    struct Target {
        adapter: LUID,
        id: u32,
    }

    /// 被我们关掉 HDR 的屏幕，录完要打开
    static DISABLED: Mutex<Vec<(u32, i32, u32)>> = Mutex::new(Vec::new());

    fn header(r#type: i32, size: usize, t: Target) -> DISPLAYCONFIG_DEVICE_INFO_HEADER {
        DISPLAYCONFIG_DEVICE_INFO_HEADER {
            r#type,
            size: size as u32,
            adapterId: t.adapter,
            id: t.id,
        }
    }

    /// 当前连接的所有屏幕
    fn targets() -> Vec<Target> {
        unsafe {
            loop {
                let (mut paths, mut modes) = (0u32, 0u32);
                if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut paths, &mut modes)
                    != ERROR_SUCCESS
                {
                    return Vec::new();
                }
                let mut path_info: Vec<DISPLAYCONFIG_PATH_INFO> =
                    vec![std::mem::zeroed(); paths as usize];
                let mut mode_info: Vec<DISPLAYCONFIG_MODE_INFO> =
                    vec![std::mem::zeroed(); modes as usize];
                let r = QueryDisplayConfig(
                    QDC_ONLY_ACTIVE_PATHS,
                    &mut paths,
                    path_info.as_mut_ptr(),
                    &mut modes,
                    mode_info.as_mut_ptr(),
                    std::ptr::null_mut(),
                );
                // 两次调用之间屏幕变了，重新查
                if r == ERROR_INSUFFICIENT_BUFFER {
                    continue;
                }
                if r != ERROR_SUCCESS {
                    return Vec::new();
                }
                path_info.truncate(paths as usize);
                return path_info
                    .iter()
                    .map(|p| Target {
                        adapter: p.targetInfo.adapterId,
                        id: p.targetInfo.id,
                    })
                    .collect();
            }
        }
    }

    /// HDR 是否开着：开启了高级颜色，并且不是系统强制的广色域（自动颜色管理），后者关不掉
    fn hdr_enabled(t: Target) -> bool {
        unsafe {
            let mut info: DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO = std::mem::zeroed();
            info.header = header(
                DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO,
                size_of::<DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO>(),
                t,
            );
            if DisplayConfigGetDeviceInfo(&mut info.header) != ERROR_SUCCESS as i32 {
                return false;
            }
            let bits = info.Anonymous.value;
            let enabled = bits & 0b10 != 0;
            let wide_color_enforced = bits & 0b100 != 0;
            enabled && !wide_color_enforced
        }
    }

    fn set_hdr(t: Target, on: bool) -> bool {
        unsafe {
            let mut state: DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE = std::mem::zeroed();
            state.header = header(
                DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE,
                size_of::<DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE>(),
                t,
            );
            state.Anonymous.value = on as u32;
            DisplayConfigSetDeviceInfo(&state.header) == ERROR_SUCCESS as i32
        }
    }

    pub fn any_enabled() -> bool {
        targets().into_iter().any(hdr_enabled)
    }

    /// 关闭所有屏幕的 HDR，返回关掉了几块
    pub fn disable() -> u32 {
        let mut disabled = DISABLED.lock().unwrap();
        let mut count = 0;
        for t in targets() {
            if hdr_enabled(t) && set_hdr(t, false) {
                disabled.push((t.adapter.LowPart, t.adapter.HighPart, t.id));
                count += 1;
            }
        }
        count
    }

    /// 打开被我们关掉的屏幕的 HDR
    pub fn restore() {
        let list: Vec<_> = DISABLED.lock().unwrap().drain(..).collect();
        for (low, high, id) in list {
            set_hdr(
                Target {
                    adapter: LUID {
                        LowPart: low,
                        HighPart: high,
                    },
                    id,
                },
                true,
            );
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn any_enabled() -> bool {
        false
    }
    pub fn disable() -> u32 {
        0
    }
    pub fn restore() {}
}

pub use imp::restore;

/// 是否有屏幕开着 HDR
#[tauri::command]
pub fn hdr_enabled() -> bool {
    imp::any_enabled()
}

/// 临时关闭 HDR（录屏前），返回关掉的屏幕数量
#[tauri::command]
pub fn hdr_disable() -> u32 {
    imp::disable()
}

/// 恢复被临时关闭的 HDR（录屏结束后）
#[tauri::command]
pub fn hdr_restore() {
    imp::restore()
}
