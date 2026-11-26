//! 受控命令行执行工具：`run_command`，支持 Windows PowerShell/CMD UTF-8、超时与进程树取消。

use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;

use process_wrap::tokio::{CommandWrap, KillOnDrop};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::oneshot;

use crate::core::process::decode_output;

use super::paths::resolve_target_path;
use super::registry::{AiTool, AiToolContext, AiToolFuture, AiToolResult, ToolApprovalPolicy};

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_TIMEOUT_SECS: u64 = 120;
const MAX_COMMAND_OUTPUT_BYTES: usize = 32 * 1024;

/// 正在运行的命令取消句柄表，前端点击「停止」时可立即终止整个进程树
#[derive(Default)]
pub(crate) struct AiCommandState {
    running: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

impl AiCommandState {
    pub(crate) fn register(&self, run_id: &str) -> oneshot::Receiver<()> {
        let (tx, rx) = oneshot::channel();
        let mut guard = self.running.lock().unwrap_or_else(|e| e.into_inner());
        guard.insert(run_id.to_string(), tx);
        rx
    }

    pub(crate) fn unregister(&self, run_id: &str) {
        let mut guard = self.running.lock().unwrap_or_else(|e| e.into_inner());
        guard.remove(run_id);
    }

    pub(crate) fn cancel(&self, run_id: &str) -> bool {
        let tx = {
            let mut guard = self.running.lock().unwrap_or_else(|e| e.into_inner());
            guard.remove(run_id)
        };
        tx.map(|sender| sender.send(()).is_ok()).unwrap_or(false)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunCommandResult {
    pub(crate) exit_code: Option<i32>,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) timed_out: bool,
    pub(crate) cancelled: bool,
    pub(crate) truncated_stdout: bool,
    pub(crate) truncated_stderr: bool,
    pub(crate) cwd: String,
}

fn truncate_utf8_bytes(text: &str, max_bytes: usize) -> (String, bool) {
    if text.len() <= max_bytes {
        return (text.to_string(), false);
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    (text[..end].to_string(), true)
}

async fn read_pipe_bounded<R>(mut reader: R) -> Vec<u8>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    let cap = MAX_COMMAND_OUTPUT_BYTES + 1024;
    loop {
        match reader.read(&mut chunk).await {
            Ok(0) => break,
            Ok(n) => {
                if buf.len() < cap {
                    let keep = (cap - buf.len()).min(n);
                    buf.extend_from_slice(&chunk[..keep]);
                }
            }
            Err(_) => break,
        }
    }
    buf
}

fn build_shell_command(command_text: &str, shell: &str, cwd: &Path) -> Command {
    #[cfg(windows)]
    {
        if shell.eq_ignore_ascii_case("cmd") {
            let mut cmd = Command::new("cmd.exe");
            cmd.args(["/D", "/S", "/C", command_text]);
            cmd.current_dir(cwd);
            return cmd;
        }
        // 在 PowerShell 中统一将控制台编码切到 UTF-8，避免中文输出乱码
        let wrapped = format!(
            "[Console]::InputEncoding = [Console]::OutputEncoding = $OutputEncoding = [System.Text.UTF8Encoding]::new($false); {command_text}"
        );
        let mut cmd = Command::new("powershell.exe");
        cmd.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &wrapped,
        ]);
        cmd.current_dir(cwd);
        cmd
    }
    #[cfg(not(windows))]
    {
        let _ = shell;
        let mut cmd = Command::new("sh");
        cmd.args(["-c", command_text]);
        cmd.current_dir(cwd);
        cmd
    }
}

pub(crate) async fn run_command_impl(
    cancel_rx: oneshot::Receiver<()>,
    workspace_dir: &str,
    command_text: &str,
    shell: Option<&str>,
    cwd: Option<&str>,
    timeout_secs: Option<u64>,
) -> Result<RunCommandResult, String> {
    if command_text.trim().is_empty() {
        return Err("Command must not be empty.".into());
    }
    let (ws_root, work_dir, _outside) = resolve_target_path(workspace_dir, cwd)?;
    if work_dir == ws_root && !work_dir.exists() {
        std::fs::create_dir_all(&work_dir).map_err(|err| {
            format!(
                "Could not create workspace directory {}: {err}",
                work_dir.display()
            )
        })?;
    }
    if !work_dir.is_dir() {
        return Err(format!(
            "Working directory does not exist: {}",
            work_dir.display()
        ));
    }

    let shell_kind = shell.unwrap_or("powershell").trim();
    let timeout = Duration::from_secs(
        timeout_secs
            .unwrap_or(DEFAULT_TIMEOUT_SECS)
            .clamp(1, MAX_TIMEOUT_SECS),
    );

    let mut base_cmd = build_shell_command(command_text, shell_kind, &work_dir);
    base_cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut wrapped = CommandWrap::from(base_cmd);
    #[cfg(windows)]
    {
        use process_wrap::tokio::{CreationFlags, JobObject};
        use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
        let mut flags = CreationFlags(Default::default());
        flags.0 .0 = CREATE_NO_WINDOW;
        wrapped.wrap(JobObject).wrap(flags);
    }
    #[cfg(unix)]
    wrapped.wrap(process_wrap::tokio::ProcessGroup::leader());
    wrapped.wrap(KillOnDrop);

    let mut child = wrapped
        .spawn()
        .map_err(|err| format!("Could not start command: {err}"))?;

    let stdout_pipe = child.stdout().take();
    let stderr_pipe = child.stderr().take();

    let stdout_task = tokio::spawn(async move {
        match stdout_pipe {
            Some(pipe) => read_pipe_bounded(pipe).await,
            None => Vec::new(),
        }
    });
    let stderr_task = tokio::spawn(async move {
        match stderr_pipe {
            Some(pipe) => read_pipe_bounded(pipe).await,
            None => Vec::new(),
        }
    });

    let mut exit_code: Option<i32> = None;
    let mut timed_out = false;
    let mut cancelled = false;

    tokio::select! {
        status_res = Pin::from(child.wait()) => {
            if let Ok(status) = status_res {
                exit_code = status.code();
            }
        }
        _ = tokio::time::sleep(timeout) => {
            timed_out = true;
            let _ = Pin::from(child.kill()).await;
        }
        _ = cancel_rx => {
            cancelled = true;
            let _ = Pin::from(child.kill()).await;
        }
    }

    let raw_stdout = tokio::time::timeout(Duration::from_secs(2), stdout_task)
        .await
        .ok()
        .and_then(|res| res.ok())
        .unwrap_or_default();
    let raw_stderr = tokio::time::timeout(Duration::from_secs(2), stderr_task)
        .await
        .ok()
        .and_then(|res| res.ok())
        .unwrap_or_default();

    let decoded_stdout = decode_output(&raw_stdout);
    let decoded_stderr = decode_output(&raw_stderr);
    let (stdout, truncated_stdout) = truncate_utf8_bytes(&decoded_stdout, MAX_COMMAND_OUTPUT_BYTES);
    let (stderr, truncated_stderr) = truncate_utf8_bytes(&decoded_stderr, MAX_COMMAND_OUTPUT_BYTES);

    Ok(RunCommandResult {
        exit_code,
        stdout,
        stderr,
        timed_out,
        cancelled,
        truncated_stdout,
        truncated_stderr,
        cwd: work_dir.to_string_lossy().to_string(),
    })
}

pub(crate) struct RunCommandTool;

impl AiTool for RunCommandTool {
    fn name(&self) -> &'static str {
        "run_command"
    }

    fn description(&self) -> &'static str {
        "Execute a command on Windows (default shell: PowerShell; optional shell: cmd). Prefer PowerShell syntax rather than bash/Linux commands."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Command string to execute in the selected Windows shell."
                },
                "shell": {
                    "type": "string",
                    "enum": ["powershell", "cmd"],
                    "description": "Windows shell to use (default: powershell)."
                },
                "cwd": {
                    "type": "string",
                    "description": "Working directory (relative to workspace or absolute). Defaults to the current workspace directory."
                },
                "timeout_secs": {
                    "type": "integer",
                    "description": "Timeout in seconds (default 30, max 120)."
                }
            },
            "required": ["command"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::Command
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let command = args.get("command").and_then(Value::as_str).unwrap_or("");
            let shell = args
                .get("shell")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty());
            let cwd = args
                .get("cwd")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty());
            let timeout_secs = args.get("timeout_secs").and_then(Value::as_u64);

            let cancel_rx = ctx.command_state.register(ctx.run_id);
            let run_res = run_command_impl(
                cancel_rx,
                ctx.workspace_dir,
                command,
                shell,
                cwd,
                timeout_secs,
            )
            .await;
            ctx.command_state.unregister(ctx.run_id);

            match run_res {
                Ok(res) => {
                    let mut status_parts = vec![format!("cwd: {}", res.cwd)];
                    if res.cancelled {
                        status_parts.push("status: cancelled".into());
                    } else if res.timed_out {
                        status_parts.push("status: timed out".into());
                    } else {
                        let code = res
                            .exit_code
                            .map(|c| c.to_string())
                            .unwrap_or_else(|| "unknown".into());
                        status_parts.push(format!("exit_code: {code}"));
                    }

                    let mut sections = vec![status_parts.join(" | ")];
                    if !res.stdout.is_empty() {
                        let suffix = if res.truncated_stdout {
                            " (truncated)"
                        } else {
                            ""
                        };
                        sections.push(format!("[stdout{suffix}]\n{}", res.stdout));
                    }
                    if !res.stderr.is_empty() {
                        let suffix = if res.truncated_stderr {
                            " (truncated)"
                        } else {
                            ""
                        };
                        sections.push(format!("[stderr{suffix}]\n{}", res.stderr));
                    }
                    if res.stdout.is_empty() && res.stderr.is_empty() {
                        sections.push("(no output)".into());
                    }

                    let is_error = res.cancelled
                        || res.timed_out
                        || res.exit_code.map(|c| c != 0).unwrap_or(false);
                    AiToolResult {
                        text: sections.join("\n\n"),
                        is_error,
                        output_file: None,
                    }
                }
                Err(err) => AiToolResult::err(err),
            }
        })
    }
}
