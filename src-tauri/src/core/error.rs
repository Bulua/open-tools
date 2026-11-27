//! 全应用统一的后端错误模型（`AppError`）与结果别名（`AppResult<T>`）。
//!
//! 所有新接入或重构的 Tauri 命令统一返回 `AppResult<T>`，序列化为 `{ code, message }`，
//! 供前端 `src/api/common/request.ts` 统一拦截、分类处理与展示。

use serde::Serialize;
use specta::Type;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AppErrorCode {
    InvalidInput,
    NotFound,
    Unauthorized,
    Network,
    Provider,
    Cancelled,
    Busy,
    Io,
    Internal,
}

#[derive(Debug, Clone, Serialize, Error, Type)]
#[error("{message}")]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppError {
    pub(crate) code: AppErrorCode,
    pub(crate) message: String,
}

pub(crate) type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub(crate) fn new(code: AppErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub(crate) fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::InvalidInput, message)
    }

    pub(crate) fn provider(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Provider, message)
    }

    pub(crate) fn io(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Io, message)
    }

    pub(crate) fn internal(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Internal, message)
    }

    /// 根据底层错误文本自动归类常见错误码，兼容尚未细分的内部 Result<_, String>
    pub(crate) fn from_message(message: impl Into<String>) -> Self {
        let msg = message.into();
        let lower = msg.to_ascii_lowercase();
        let code = if lower.contains("already running") {
            AppErrorCode::Busy
        } else if lower.contains("cancelled") || lower.contains("canceled") {
            AppErrorCode::Cancelled
        } else if lower.contains("api key")
            || lower.contains("unauthorized")
            || lower.contains("401")
            || lower.contains("403")
        {
            AppErrorCode::Unauthorized
        } else if lower.contains("required")
            || lower.contains("invalid")
            || lower.contains("must not be empty")
        {
            AppErrorCode::InvalidInput
        } else if lower.contains("not found") || lower.contains("does not exist") {
            AppErrorCode::NotFound
        } else if lower.contains("timed out")
            || lower.contains("timeout")
            || lower.contains("connection")
            || lower.contains("dns")
        {
            AppErrorCode::Network
        } else if lower.contains("could not read")
            || lower.contains("could not write")
            || lower.contains("could not save")
            || lower.contains("could not access")
        {
            AppErrorCode::Io
        } else {
            AppErrorCode::Internal
        };
        Self { code, message: msg }
    }
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        Self::from_message(value)
    }
}

impl From<&str> for AppError {
    fn from(value: &str) -> Self {
        Self::from_message(value)
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::io(value.to_string())
    }
}
