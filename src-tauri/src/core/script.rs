//! 运行 PowerShell 脚本的公共代码：临时文件夹、隐藏命令行窗口、超时结束。
//! 脚本先写成临时 .ps1 文件再执行，参数通过环境变量传入，避免命令行转义问题。

use std::ffi::OsStr;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

static COUNTER: AtomicU64 = AtomicU64::new(0);

#[cfg(windows)]
pub fn hide_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW：不弹出命令行窗口
    cmd.creation_flags(0x0800_0000);
}
#[cfg(not(windows))]
pub fn hide_window(_: &mut Command) {}

/// 用完自动删除的临时文件夹
pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new() -> Result<Self, String> {
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("open-tools-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&dir).map_err(|e| format!("Can't create a temporary folder: {e}"))?;
        Ok(Self(dir))
    }

    pub fn join(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub struct ScriptOutput {
    pub stdout: String,
    pub stderr: String,
}

/// 把脚本写入临时文件夹并执行；超过 timeout 时结束进程并返回 timeout_message
pub fn run_powershell(
    dir: &TempDir,
    script: &str,
    envs: &[(&str, &OsStr)],
    timeout: Duration,
    timeout_message: &str,
) -> Result<ScriptOutput, String> {
    let script_path = dir.join("script.ps1");
    std::fs::write(&script_path, script).map_err(|e| format!("Can't write a temporary file: {e}"))?;

    let mut cmd = Command::new("powershell");
    hide_window(&mut cmd);
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in envs {
        cmd.env(key, value);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Can't start PowerShell: {e}"))?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() > timeout => {
                let _ = child.kill();
                return Err(timeout_message.to_string());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(ScriptOutput {
        stdout: crate::tools::network::decode_output(&output.stdout),
        stderr: crate::tools::network::decode_output(&output.stderr),
    })
}
