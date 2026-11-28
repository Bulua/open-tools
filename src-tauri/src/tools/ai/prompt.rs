//! AI 内置系统提示词与本地环境约定（后端统一维护）。

use std::collections::HashSet;

/// 内置不可更改的基础系统提示词
pub(crate) const BUILTIN_SYSTEM_PROMPT: &str = "你是个乐于助人ai助手。";

const LOCAL_FILE_TOOLS: &[&str] = &[
    "list_dir",
    "read_file",
    "write_file",
    "edit_file",
    "run_command",
    "image_info",
    "image_process",
    "image_stitch",
    "image_to_ico",
    "image_remove_bg",
];

/// 按实际启用的内置工具动态拼接系统提示词：
/// - 具体工具名称与能力完全交由请求体 `tools` 的 Schema/description 描述，不再在提示词中硬编码列举；
/// - 仅在启用了本地文件/命令/图片工具时，按需补充工作目录、Windows Shell 语法与文件预览链接约定。
pub(crate) fn build_system_prompt(
    workspace_dir: &str,
    enabled_builtin_tools: &HashSet<String>,
) -> String {
    let has_run_command = enabled_builtin_tools.contains("run_command");
    let has_local_files = LOCAL_FILE_TOOLS
        .iter()
        .any(|name| enabled_builtin_tools.contains(*name));

    if !has_local_files {
        return BUILTIN_SYSTEM_PROMPT.to_string();
    }

    let env_line = if has_run_command {
        "当前运行环境：Windows（默认使用 PowerShell，亦可指定 shell=\"cmd\"；请使用 Windows 语法，不要照搬 Linux bash 及 && 链式语法，可用分号 ; 衔接）。"
    } else {
        "当前运行环境：Windows。"
    };

    [
        BUILTIN_SYSTEM_PROMPT,
        "",
        env_line,
        &format!("当前会话工作目录：{workspace_dir}（相对路径默认基于该目录）。"),
        "回复中提及或引用具体本地文件时，请使用标准 Markdown 文件链接格式 [文件名](file:///完整路径)（Windows 路径统一用正斜杠 /，需要定位具体代码行时附加 #L10 或 #L10-L25）；生成或处理了本地图片时，可直接使用 ![图片说明](file:///完整路径) 内联展示图片，用户可点击在右侧面板查看与保存。",
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn omits_workspace_and_tool_hints_without_local_tools() {
        let empty = HashSet::new();
        assert_eq!(build_system_prompt("D:\\ws", &empty), BUILTIN_SYSTEM_PROMPT);

        let only_clock = HashSet::from(["clock_list".to_string(), "calculate".to_string()]);
        assert_eq!(
            build_system_prompt("D:\\ws", &only_clock),
            BUILTIN_SYSTEM_PROMPT
        );
    }

    #[test]
    fn includes_workspace_and_link_conventions_for_file_tools() {
        let tools = HashSet::from(["read_file".to_string()]);
        let prompt = build_system_prompt("D:\\ws\\conv", &tools);
        assert!(prompt.contains(BUILTIN_SYSTEM_PROMPT));
        assert!(prompt.contains("当前运行环境：Windows。"));
        assert!(prompt.contains("D:\\ws\\conv"));
        assert!(prompt.contains("file:///"));
        assert!(!prompt.contains("PowerShell"));
        assert!(!prompt.contains("clock_list"));
    }

    #[test]
    fn includes_shell_syntax_hint_when_run_command_enabled() {
        let tools = HashSet::from(["run_command".to_string()]);
        let prompt = build_system_prompt("D:\\ws\\conv", &tools);
        assert!(prompt.contains("PowerShell"));
        assert!(prompt.contains("D:\\ws\\conv"));
    }
}
