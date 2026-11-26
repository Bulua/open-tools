//! 统一的 AI 工具接口（`AiTool`）与注册表（`AiToolRegistry`）。
//!
//! 后续将 Open Tools 的任意其他工具开放给 AI 调用时：
//! 1. 新建结构体并实现 `AiTool`（声明名称、说明、JSON Schema、审批策略与执行逻辑）；
//! 2. 在 `AiToolRegistry::with_builtin_tools()` 中调用 `registry.register(MyTool)` 即可自动生效，
//!    模型声明、审批策略与前端执行链路均自动对接。

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::tools::encode::id_card::ai_tools::ParseIdCardTool;
use crate::tools::markdown::notebook::ai_tools::{
    NotebookDeleteTool, NotebookListTool, NotebookReadTool, NotebookSaveTool,
};
use crate::tools::network::mcp_inspector::ai_tools::{
    McpAddConnectionTool, McpInspectConnectionTool, McpListConnectionsTool,
};

use super::fs_tools::{EditFileTool, ListDirTool, ReadFileTool, WriteFileTool};
use super::shell::{AiCommandState, RunCommandTool};

/// 工具执行前的安全审批策略：
/// - `Auto`：直接放行（如读取文件、目录浏览、纯查询/格式转换类工具）
/// - `Command`：受会话「逐次确认 / 自动放行」策略控制，默认弹窗确认
/// - `ExternalWrite`：工作区内自动执行，写入工作区外路径时弹窗确认
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ToolApprovalPolicy {
    Auto,
    Command,
    ExternalWrite,
}

/// 暴露给前端与大模型的标准工具声明
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiToolDefinition {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) parameters: Value,
    pub(crate) approval: ToolApprovalPolicy,
}

/// 写/改文件类工具成功完成后附带的文件快照，供前端右侧「输出内容」自动展示
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiToolOutputFile {
    pub(crate) path: String,
    pub(crate) content: String,
}

/// 统一的工具执行返回结构
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiToolResult {
    pub(crate) text: String,
    pub(crate) is_error: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) output_file: Option<AiToolOutputFile>,
}

impl AiToolResult {
    pub(crate) fn ok(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            is_error: false,
            output_file: None,
        }
    }

    pub(crate) fn ok_with_file(
        text: impl Into<String>,
        path: impl Into<String>,
        content: impl Into<String>,
    ) -> Self {
        Self {
            text: text.into(),
            is_error: false,
            output_file: Some(AiToolOutputFile {
                path: path.into(),
                content: content.into(),
            }),
        }
    }

    pub(crate) fn err(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            is_error: true,
            output_file: None,
        }
    }
}

/// 工具执行上下文，后续扩展其他工具时可按需通过 `app` 访问应用状态与数据目录
pub(crate) struct AiToolContext<'a> {
    pub(crate) app: &'a AppHandle,
    pub(crate) run_id: &'a str,
    pub(crate) workspace_dir: &'a str,
    pub(crate) command_state: &'a AiCommandState,
}

pub(crate) type AiToolFuture<'a> = Pin<Box<dyn Future<Output = AiToolResult> + Send + 'a>>;

/// 所有可供 AI 调用的后端工具统一实现的接口
pub(crate) trait AiTool: Send + Sync {
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn parameters_schema(&self) -> Value;

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::Auto
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a>;
}

/// 已注册 AI 工具的集中管理容器（保持注册顺序，支持 O(1) 按名查找）
#[derive(Default)]
pub(crate) struct AiToolRegistry {
    tools: Vec<Box<dyn AiTool>>,
    index: HashMap<&'static str, usize>,
}

impl AiToolRegistry {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// 构造并注册所有默认内置工具
    pub(crate) fn with_builtin_tools() -> Self {
        let mut registry = Self::new();
        registry.register(ListDirTool);
        registry.register(ReadFileTool);
        registry.register(WriteFileTool);
        registry.register(EditFileTool);
        registry.register(RunCommandTool);
        registry.register(McpListConnectionsTool);
        registry.register(McpAddConnectionTool);
        registry.register(McpInspectConnectionTool);
        registry.register(NotebookListTool);
        registry.register(NotebookReadTool);
        registry.register(NotebookSaveTool);
        registry.register(NotebookDeleteTool);
        registry.register(ParseIdCardTool);
        registry
    }

    /// 注册单个实现 `AiTool` 的工具；同名工具会覆盖原有实现
    pub(crate) fn register<T: AiTool + 'static>(&mut self, tool: T) -> &mut Self {
        let name = tool.name();
        if let Some(&idx) = self.index.get(name) {
            self.tools[idx] = Box::new(tool);
        } else {
            let idx = self.tools.len();
            self.tools.push(Box::new(tool));
            self.index.insert(name, idx);
        }
        self
    }

    pub(crate) fn definitions(&self) -> Vec<AiToolDefinition> {
        self.tools
            .iter()
            .map(|tool| AiToolDefinition {
                name: tool.name().to_string(),
                description: tool.description().to_string(),
                parameters: tool.parameters_schema(),
                approval: tool.approval_policy(),
            })
            .collect()
    }

    pub(crate) fn get(&self, name: &str) -> Option<&dyn AiTool> {
        self.index
            .get(name)
            .and_then(|&idx| self.tools.get(idx))
            .map(|boxed| boxed.as_ref())
    }

    pub(crate) async fn execute(
        &self,
        name: &str,
        args: Value,
        ctx: &AiToolContext<'_>,
    ) -> AiToolResult {
        let Some(tool) = self.get(name) else {
            return AiToolResult::err(format!("Unknown built-in tool: {name}"));
        };
        tool.execute(args, ctx).await
    }
}
