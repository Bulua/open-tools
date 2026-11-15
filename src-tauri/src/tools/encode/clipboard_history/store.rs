use std::path::PathBuf;
use std::ptr::{null, null_mut};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

pub(super) const MAX_ENTRY_BYTES: usize = 256 * 1024;
pub(super) const MAX_HISTORY_ITEMS: usize = 1000;
const MAX_RECENT_BYTES: usize = 4 * 1024 * 1024;
const RETENTION_MS: u64 = 7 * 24 * 60 * 60 * 1000;

fn default_max_items() -> usize {
    200
}

pub(super) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub(super) fn preview(text: &str) -> String {
    let mut chars = text.chars();
    let mut preview: String = chars.by_ref().take(420).collect();
    if chars.next().is_some() {
        preview.push('…');
    }
    preview
}

#[derive(Clone, Deserialize, Serialize)]
pub(super) struct Item {
    pub id: u32,
    pub text: Arc<str>,
    pub copied_at: u64,
}

impl Item {
    pub fn active(&self, time: u64) -> bool {
        time.saturating_sub(self.copied_at) < RETENTION_MS
    }
}

#[derive(Clone, Deserialize, Serialize)]
pub(super) struct History {
    version: u8,
    next_id: u32,
    pub enabled: bool,
    #[serde(default = "default_max_items")]
    pub max_items: usize,
    pub items: Vec<Item>,
}

impl Default for History {
    fn default() -> Self {
        Self {
            version: 1,
            next_id: 1,
            enabled: true,
            max_items: default_max_items(),
            items: Vec::new(),
        }
    }
}

impl History {
    pub fn record(&mut self, text: String, time: u64) {
        let item = match self
            .items
            .iter()
            .position(|item| item.active(time) && item.text.as_ref() == text)
        {
            Some(index) => Item {
                copied_at: time,
                ..self.items.remove(index)
            },
            None => {
                let id = self.next_id;
                self.next_id += 1;
                Item {
                    id,
                    text: text.into(),
                    copied_at: time,
                }
            }
        };
        self.items.insert(0, item);
        self.prune(time);
    }

    pub fn prune(&mut self, time: u64) -> bool {
        let previous = self.items.len();
        let (mut count, mut bytes) = (0, 0);
        self.items.retain(|item| {
            if !item.active(time) {
                return false;
            }
            count += 1;
            bytes += item.text.len();
            count <= self.max_items && bytes <= MAX_RECENT_BYTES
        });
        previous != self.items.len()
    }
}

pub(super) struct Store {
    path: PathBuf,
    pub history: History,
}

impl Store {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let history = match std::fs::read(&path) {
            Ok(data) => {
                let decoded = protect(&data, false)?;
                let history: History =
                    serde_json::from_slice(&decoded).map_err(|_| "Can't read clipboard history")?;
                if history.version != 1 {
                    return Err("Unsupported clipboard history version".into());
                }
                history
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => History::default(),
            Err(error) => return Err(format!("Can't read clipboard history: {error}")),
        };
        let mut store = Self { path, history };
        let mut history = store.history.clone();
        if history.prune(now()) {
            store.save(history)?;
        }
        Ok(store)
    }

    pub fn save(&mut self, history: History) -> Result<(), String> {
        let json = serde_json::to_vec(&history).map_err(|_| "Can't encode clipboard history")?;
        let data = protect(&json, true)?;
        let temp = self.path.with_extension("tmp");
        let result = std::fs::write(&temp, data).and_then(|_| std::fs::rename(&temp, &self.path));
        if let Err(error) = result {
            let _ = std::fs::remove_file(&temp);
            return Err(format!("Can't save clipboard history: {error}"));
        }
        self.history = history;
        Ok(())
    }
}

// 使用当前 Windows 用户的 DPAPI 保护历史，临时文件也只写入加密后的内容。
fn protect(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(data.len()).map_err(|_| "Clipboard history is too large")?,
        pbData: data.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let result = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                null(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                null_mut(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if result == 0 {
        return Err(if encrypt {
            "Can't encrypt clipboard history"
        } else {
            "Can't decrypt clipboard history"
        }
        .into());
    }
    if output.pbData.is_null() {
        return Err("Windows returned an empty clipboard history blob".into());
    }
    let bytes = unsafe {
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData.cast());
        bytes
    };
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recording_defaults_on_and_deduplicates() {
        let mut history = History::default();
        assert!(history.enabled);
        history.record("原始文本\r\n  ".into(), 100);
        history.record("其他内容".into(), 101);
        history.record("原始文本\r\n  ".into(), 102);
        assert_eq!(history.items.len(), 2);
        assert_eq!(history.items[0].id, 1);
        assert_eq!(history.items[0].copied_at, 102);
        assert!(history.prune(102 + RETENTION_MS));
        assert!(history.items.is_empty());
    }

    #[test]
    fn recent_history_is_bounded() {
        let mut history = History::default();
        history.max_items = 3;
        for index in 0..=3 {
            history.record(index.to_string(), index as u64);
        }
        assert_eq!(history.items.len(), 3);
        assert_eq!(history.items.last().unwrap().text.as_ref(), "1");
        history.max_items = 1;
        assert!(history.prune(3));
        assert_eq!(history.items[0].text.as_ref(), "3");
        assert_eq!(history.items.len(), 1);
    }

    #[test]
    fn old_pinned_entries_follow_normal_retention() {
        let mut history: History = serde_json::from_str(
            r#"{"version":1,"next_id":2,"enabled":true,"items":[{"id":1,"text":"旧条目","copied_at":10,"pinned":true}]}"#,
        ).unwrap();
        assert_eq!(history.max_items, 200);
        assert!(!history.prune(11));
        assert!(history.prune(10 + RETENTION_MS));
        assert!(history.items.is_empty());
    }

    #[test]
    fn pause_and_history_survive_restart_in_an_encrypted_file() {
        let path =
            std::env::temp_dir().join(format!("open-tools-clipboard-{}.dat", std::process::id()));
        let mut store = Store::load(path.clone()).unwrap();
        let mut history = History::default();
        history.record("clipboard-private-test-value".into(), now());
        store.save(history.clone()).unwrap();
        history.enabled = false;
        history.max_items = 73;
        store.save(history).unwrap();
        let persisted = Store::load(path.clone()).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert!(!persisted.history.enabled);
        assert_eq!(persisted.history.max_items, 73);
        assert_eq!(
            persisted.history.items[0].text.as_ref(),
            "clipboard-private-test-value"
        );
        assert!(!String::from_utf8_lossy(&bytes).contains("clipboard-private-test-value"));
    }
}
