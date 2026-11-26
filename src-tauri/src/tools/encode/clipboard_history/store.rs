use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use crate::core::dpapi::protect;

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
