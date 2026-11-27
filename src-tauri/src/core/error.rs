//! 全应用统一的后端错误模型（`AppError`）、结果别名（`AppResult<T>`）与统一接口响应体（`ApiResponse<T>`）。
//!
//! 所有新接入或重构的 Tauri 命令统一返回 `ApiResponse<T>`，序列化为 `{ code, msg, data }`，
//! 供前端 `src/api/common/request.ts` 统一拦截、解包、分类处理与展示。

use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ApiCode {
    Ok,
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

impl From<AppErrorCode> for ApiCode {
    fn from(value: AppErrorCode) -> Self {
        match value {
            AppErrorCode::InvalidInput => Self::InvalidInput,
            AppErrorCode::NotFound => Self::NotFound,
            AppErrorCode::Unauthorized => Self::Unauthorized,
            AppErrorCode::Network => Self::Network,
            AppErrorCode::Provider => Self::Provider,
            AppErrorCode::Cancelled => Self::Cancelled,
            AppErrorCode::Busy => Self::Busy,
            AppErrorCode::Io => Self::Io,
            AppErrorCode::Internal => Self::Internal,
        }
    }
}

/// 统一的前后端命令 JSON 响应包装（包含 `code`、`msg`、`data` 三个字段）。
#[derive(Debug, Clone, Serialize, Type)]
#[specta(inline)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiResponse<T> {
    pub(crate) code: ApiCode,
    pub(crate) msg: String,
    pub(crate) data: Option<T>,
}

impl<T> ApiResponse<T> {
    pub(crate) fn ok(data: T) -> Self {
        Self {
            code: ApiCode::Ok,
            msg: String::new(),
            data: Some(data),
        }
    }

    pub(crate) fn err(err: AppError) -> Self {
        Self {
            code: err.code.into(),
            msg: err.message,
            data: None,
        }
    }
}

impl<T> From<AppResult<T>> for ApiResponse<T> {
    fn from(value: AppResult<T>) -> Self {
        match value {
            Ok(data) => Self::ok(data),
            Err(err) => Self::err(err),
        }
    }
}

/// 满足 Tauri `#[tauri::command]` 异步引用参数的 `Result` 约束，同时始终以 `Ok(ApiResponse<T>)` 返回标准 JSON 包装。
pub(crate) type ApiResult<T> = Result<ApiResponse<T>, ()>;

pub(crate) fn api_ok<T>(data: T) -> ApiResult<T> {
    Ok(ApiResponse::ok(data))
}

pub(crate) fn api_result<T>(res: AppResult<T>) -> ApiResult<T> {
    Ok(res.into())
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

    pub(crate) fn not_found(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::NotFound, message)
    }

    pub(crate) fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Unauthorized, message)
    }

    pub(crate) fn network(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Network, message)
    }

    pub(crate) fn provider(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Provider, message)
    }

    pub(crate) fn cancelled(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Cancelled, message)
    }

    pub(crate) fn busy(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Busy, message)
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

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.message
    }
}
