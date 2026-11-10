use std::ptr::{null, null_mut};
use std::time::Duration;

use windows_sys::core::w;
use windows_sys::Win32::Foundation::{GlobalFree, HGLOBAL, HWND};
use windows_sys::Win32::System::DataExchange::{
    AddClipboardFormatListener, CloseClipboard, EmptyClipboard, GetClipboardData,
    GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatW, RemoveClipboardFormatListener, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows_sys::Win32::System::Ole::CF_UNICODETEXT;
use windows_sys::Win32::System::SystemInformation::GetTickCount64;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DestroyWindow, DispatchMessageW, GetMessageW, SetTimer, HWND_MESSAGE, MSG,
    WM_CLIPBOARDUPDATE, WM_TIMER,
};

const TEXT: u32 = CF_UNICODETEXT as u32;

fn exclude_format() -> u32 {
    unsafe { RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing")) }
}

pub(super) fn listen(
    mut capture: impl FnMut(HWND, u64),
    mut prune: impl FnMut(),
) -> Result<(), String> {
    // 用系统预定义的 STATIC 类创建消息窗口，线程直接消费剪贴板通知。
    let hwnd = unsafe {
        CreateWindowExW(
            0,
            w!("STATIC"),
            null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            null_mut(),
            null_mut(),
            null(),
        )
    };
    if hwnd.is_null() {
        return Err("Can't create the clipboard listener window".into());
    }
    let result = (|| {
        if unsafe { AddClipboardFormatListener(hwnd) } == 0 {
            return Err("Can't listen to Windows clipboard changes".into());
        }
        if unsafe { SetTimer(hwnd, 1, 60_000, None) } == 0 {
            return Err("Can't start the clipboard retention timer".into());
        }
        let mut message = MSG::default();
        loop {
            match unsafe { GetMessageW(&mut message, null_mut(), 0, 0) } {
                -1 => return Err("The Windows clipboard listener stopped".into()),
                0 => return Ok(()),
                _ => {}
            }
            match message.message {
                WM_CLIPBOARDUPDATE => {
                    // 延迟渲染的剪贴板可能尚未增加序列号，所以每条通知都尝试读取。
                    let tick = current_tick();
                    let elapsed = (tick as u32).wrapping_sub(message.time);
                    capture(hwnd, tick.saturating_sub(u64::from(elapsed)));
                }
                WM_TIMER => prune(),
                _ => unsafe {
                    DispatchMessageW(&message);
                },
            }
        }
    })();
    unsafe {
        RemoveClipboardFormatListener(hwnd);
        DestroyWindow(hwnd);
    }
    result
}

struct OpenedClipboard;

impl OpenedClipboard {
    fn open(hwnd: HWND, sequence: Option<u32>) -> Option<Self> {
        for attempt in 0..6 {
            if unsafe { OpenClipboard(hwnd) } != 0 {
                let clipboard = Self;
                if sequence
                    .is_some_and(|expected| unsafe { GetClipboardSequenceNumber() } != expected)
                {
                    return None;
                }
                return Some(clipboard);
            }
            if attempt < 5 {
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        None
    }
}

impl Drop for OpenedClipboard {
    fn drop(&mut self) {
        unsafe {
            CloseClipboard();
        }
    }
}

struct LockedMemory(*mut std::ffi::c_void, HGLOBAL);

impl LockedMemory {
    fn lock(handle: HGLOBAL) -> Option<Self> {
        if handle.is_null() {
            return None;
        }
        let pointer = unsafe { GlobalLock(handle) };
        (!pointer.is_null()).then(|| Self(pointer, handle))
    }
}

impl Drop for LockedMemory {
    fn drop(&mut self) {
        unsafe {
            GlobalUnlock(self.1);
        }
    }
}

pub(super) fn current_tick() -> u64 {
    unsafe { GetTickCount64() }
}

pub(super) fn read_text(hwnd: HWND) -> Option<String> {
    let sequence = unsafe { GetClipboardSequenceNumber() };
    let _clipboard = OpenedClipboard::open(hwnd, Some(sequence))?;
    let exclude = exclude_format();
    if exclude != 0 && unsafe { IsClipboardFormatAvailable(exclude) } != 0 {
        return None;
    }
    let can_include = unsafe { RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory")) };
    if can_include != 0 && unsafe { IsClipboardFormatAvailable(can_include) } != 0 {
        let handle = unsafe { GetClipboardData(can_include) };
        let memory = LockedMemory::lock(handle)?;
        if unsafe { GlobalSize(handle) } < 4
            || unsafe { memory.0.cast::<u32>().read_unaligned() } == 0
        {
            return None;
        }
    }
    let handle = unsafe { GetClipboardData(TEXT) };
    let memory = LockedMemory::lock(handle)?;
    // 限制读取范围，即使剪贴板中出现无结束符或异常大的数据也只扫描有限长度。
    let length = (unsafe { GlobalSize(handle) } / 2).min(super::store::MAX_ENTRY_BYTES + 1);
    let units = unsafe { std::slice::from_raw_parts(memory.0.cast::<u16>(), length) };
    let end = units.iter().position(|&unit| unit == 0)?;
    let text = String::from_utf16(&units[..end]).ok()?;
    (!text.is_empty() && text.len() <= super::store::MAX_ENTRY_BYTES).then_some(text)
}

struct TransferMemory(HGLOBAL);

impl TransferMemory {
    fn new(data: &[u8]) -> Result<Self, String> {
        let handle = unsafe { GlobalAlloc(GMEM_MOVEABLE, data.len()) };
        if handle.is_null() {
            return Err("Can't allocate Windows clipboard data".into());
        }
        let memory = Self(handle);
        let locked = LockedMemory::lock(memory.0).ok_or("Can't access Windows clipboard data")?;
        unsafe {
            std::ptr::copy_nonoverlapping(data.as_ptr(), locked.0.cast(), data.len());
        }
        Ok(memory)
    }

    fn transfer(self, format: u32) -> bool {
        if unsafe { SetClipboardData(format, self.0) }.is_null() {
            return false;
        }
        // SetClipboardData 成功后，内存归 Windows 所有。
        std::mem::forget(self);
        true
    }
}

impl Drop for TransferMemory {
    fn drop(&mut self) {
        unsafe {
            GlobalFree(self.0);
        }
    }
}

pub(super) fn write_private(hwnd: HWND, text: &str) -> Result<(), String> {
    let exclude = exclude_format();
    if exclude == 0 {
        return Err("Can't register the private clipboard format".into());
    }
    let bytes: Vec<u8> = text
        .encode_utf16()
        .chain([0])
        .flat_map(u16::to_le_bytes)
        .collect();
    let content = TransferMemory::new(&bytes)?;
    let marker = TransferMemory::new(&[1])?;
    let _clipboard =
        OpenedClipboard::open(hwnd, None).ok_or("The Windows clipboard is busy. Try again")?;
    // 先写入排除标记，保证文本不会因标记写入失败而被记录。
    if unsafe { EmptyClipboard() } == 0 || !marker.transfer(exclude) || !content.transfer(TEXT) {
        return Err("Can't write to the Windows clipboard".into());
    }
    Ok(())
}
