//! 文字转语音：使用 Windows 自带的语音（如中文「Huihui」、英文「Zira」）生成 WAV，不需要联网。
//! 脚本见 tts.ps1。

use std::time::Duration;

use tauri::ipc::Response;

use crate::core::script::{run_powershell, TempDir};

const SCRIPT: &str = include_str!("tts.ps1");
/// 一次最多朗读的字数，避免生成时间过长
const MAX_CHARS: usize = 20_000;

#[derive(serde::Serialize)]
pub struct Voice {
    name: String,
    /// 语言，如 zh-CN
    culture: String,
    gender: String,
}

fn list_voices() -> Result<Vec<Voice>, String> {
    let dir = TempDir::new()?;
    let mode = std::ffi::OsString::from("list");
    let out = run_powershell(
        &dir,
        SCRIPT,
        &[("OT_MODE", mode.as_os_str())],
        Duration::from_secs(30),
        "Timed out reading the voice list",
    )?;
    Ok(out
        .stdout
        .lines()
        .filter_map(|l| l.trim().strip_prefix("VOICE:"))
        .filter_map(|l| {
            let mut parts = l.split('|');
            Some(Voice {
                name: parts.next()?.to_string(),
                culture: parts.next()?.to_string(),
                gender: parts.next()?.to_string(),
            })
        })
        .collect())
}

/// 本机可用的语音
#[tauri::command]
pub async fn tts_voices() -> Result<Vec<Voice>, String> {
    tauri::async_runtime::spawn_blocking(list_voices)
        .await
        .map_err(|e| e.to_string())?
}

fn synthesize(text: String, voice: String, rate: i32) -> Result<Vec<u8>, String> {
    let dir = TempDir::new()?;
    let text_path = dir.join("text.txt");
    let wav_path = dir.join("speech.wav");
    std::fs::write(&text_path, text).map_err(|e| format!("Can't write a temporary file: {e}"))?;
    let voice = std::ffi::OsString::from(voice);
    let rate = std::ffi::OsString::from(rate.clamp(-10, 10).to_string());
    let out = run_powershell(
        &dir,
        SCRIPT,
        &[
            ("OT_TEXT", text_path.as_os_str()),
            ("OT_OUT", wav_path.as_os_str()),
            ("OT_VOICE", voice.as_os_str()),
            ("OT_RATE", rate.as_os_str()),
        ],
        Duration::from_secs(300),
        "Timed out generating speech",
    )?;
    if wav_path.exists() {
        return std::fs::read(&wav_path)
            .map_err(|e| format!("Can't read the generated audio: {e}"));
    }
    let detail = out
        .stdout
        .lines()
        .find_map(|l| l.trim().strip_prefix("ERR:"))
        .map(str::to_string);
    Err(format!(
        "Speech generation failed: {}",
        detail.unwrap_or_else(|| out.stderr.trim().to_string())
    ))
}

/// 把文字转成 WAV 音频
#[tauri::command]
pub async fn tts_synthesize(text: String, voice: String, rate: i32) -> Result<Response, String> {
    if text.trim().is_empty() {
        return Err("Enter the text to read aloud".into());
    }
    if text.chars().count() > MAX_CHARS {
        return Err(format!(
            "The text is too long (at most {MAX_CHARS} characters at a time)"
        ));
    }
    let wav = tauri::async_runtime::spawn_blocking(move || synthesize(text, voice, rate))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Response::new(wav))
}
