//! 截图数据类型；序列化字段保持前端协议不变。
use serde::Serialize;

#[derive(Serialize)]
pub struct ScreenshotTargets {
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) windows: Vec<ScreenshotRect>,
    pub(super) viewport: ScreenshotRect,
}

#[derive(Clone, Serialize)]
pub struct ScreenshotRect {
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) w: i32,
    pub(super) h: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotItem {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) created_at: String,
    pub(super) day: String,
    pub(super) hour: String,
}

#[derive(Clone, Copy)]
pub(super) struct CaptureBounds {
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) width: u32,
    pub(super) height: u32,
}
