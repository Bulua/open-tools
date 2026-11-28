//! B 站视频下载设置与凭据 Tauri IPC 命令入口。

use crate::core::db::Database;
use crate::core::error::{api_result, ApiResult};

use super::store::{self, BilibiliSettings};

#[tauri::command]
pub(crate) async fn bilibili_get_settings(
    db: tauri::State<'_, Database>,
) -> ApiResult<Option<BilibiliSettings>> {
    api_result(store::get_settings(db.inner()).await)
}

#[tauri::command]
pub(crate) async fn bilibili_save_settings(
    db: tauri::State<'_, Database>,
    settings: BilibiliSettings,
) -> ApiResult<BilibiliSettings> {
    api_result(store::save_settings(db.inner(), settings).await)
}
