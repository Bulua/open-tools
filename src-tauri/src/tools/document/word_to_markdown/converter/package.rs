//! DOCX 包读取、大小限制及样式和编号元数据。
use super::super::xml::{attr, is, parse, val};
use super::{style_properties, Converter, Numbering, Relation, MAX_INPUT};
use roxmltree::Document;
use std::{
    collections::HashMap,
    io::{Cursor, Read},
};
use zip::ZipArchive;

pub(super) const MAX_EXPANDED: u64 = 128 * 1024 * 1024;
pub(super) const MAX_XML: u64 = 16 * 1024 * 1024;

pub(super) fn read_entry(
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    path: &str,
    limit: u64,
) -> Result<Option<Vec<u8>>, String> {
    let mut entry = match archive.by_name(path) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Ok(None),
        Err(e) => return Err(format!("Can't read DOCX entry: {e}")),
    };
    if entry.size() > limit {
        return Err("DOCX entry exceeds the size limit".into());
    }
    let mut bytes = Vec::new();
    (&mut entry)
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Can't read DOCX entry: {e}"))?;
    if bytes.len() as u64 > limit {
        return Err("DOCX entry exceeds the size limit".into());
    }
    Ok(Some(bytes))
}
fn read_xml(archive: &mut ZipArchive<Cursor<Vec<u8>>>, path: &str) -> Result<String, String> {
    let bytes = read_entry(archive, path, MAX_XML)?.unwrap_or_default();
    // DOCX 通常使用 UTF-8；也接受带 BOM 的 UTF-16 XML。
    if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        let little = bytes[0] == 0xff;
        if bytes.len() % 2 != 0 {
            return Err("Invalid UTF-16 DOCX XML".into());
        }
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|b| {
                if little {
                    u16::from_le_bytes([b[0], b[1]])
                } else {
                    u16::from_be_bytes([b[0], b[1]])
                }
            })
            .collect();
        return String::from_utf16(&units).map_err(|e| format!("Invalid DOCX XML encoding: {e}"));
    }
    String::from_utf8(bytes).map_err(|e| format!("Invalid DOCX XML encoding: {e}"))
}
fn optional_doc(text: &str) -> Result<Option<Document<'_>>, String> {
    if text.is_empty() {
        Ok(None)
    } else {
        parse(text).map(Some)
    }
}
impl Converter {
    pub(super) fn new(data: Vec<u8>) -> Result<(Self, String), String> {
        if data.len() > MAX_INPUT {
            return Err("Word file exceeds the 64 MB size limit".into());
        }
        let mut archive =
            ZipArchive::new(Cursor::new(data)).map_err(|e| format!("Invalid DOCX file: {e}"))?;
        if archive.len() > 4096 {
            return Err("DOCX contains too many entries".into());
        }
        let mut total = 0u64;
        for i in 0..archive.len() {
            let entry = archive.by_index(i).map_err(|e| e.to_string())?;
            total = total.saturating_add(entry.size());
            if total > MAX_EXPANDED {
                return Err("Expanded DOCX exceeds the 128 MB size limit".into());
            }
        }
        let main = read_xml(&mut archive, "word/document.xml")?;
        if main.is_empty() {
            return Err("DOCX has no document body".into());
        }
        let rels = read_xml(&mut archive, "word/_rels/document.xml.rels")?;
        let mut relations = HashMap::new();
        if let Some(doc) = optional_doc(&rels)? {
            for n in doc.descendants().filter(|n| is(*n, "Relationship")) {
                if let (Some(id), Some(target), Some(kind)) =
                    (attr(n, "Id"), attr(n, "Target"), attr(n, "Type"))
                {
                    relations.insert(
                        id.into(),
                        Relation {
                            target: target.into(),
                            kind: kind.into(),
                            external: attr(n, "TargetMode") == Some("External"),
                        },
                    );
                }
            }
        }
        let xml = read_xml(&mut archive, "word/styles.xml")?;
        let mut styles = HashMap::new();
        if let Some(doc) = optional_doc(&xml)? {
            for n in doc.descendants().filter(|n| is(*n, "style")) {
                if let Some(id) = attr(n, "styleId") {
                    let mut style = style_properties(n);
                    if style.heading.is_none() {
                        let name = val(n, "name").unwrap_or(id).to_ascii_lowercase();
                        style.heading = name
                            .strip_prefix("heading ")
                            .or_else(|| name.strip_prefix("heading"))
                            .and_then(|v| v.parse().ok())
                            .filter(|v| (1..=6).contains(v));
                    }
                    styles.insert(id.into(), style);
                }
            }
        }
        let xml = read_xml(&mut archive, "word/numbering.xml")?;
        let mut numbering = HashMap::new();
        if let Some(doc) = optional_doc(&xml)? {
            let mut abstracts = HashMap::new();
            for n in doc.descendants().filter(|n| is(*n, "abstractNum")) {
                if let Some(id) = attr(n, "abstractNumId") {
                    for level in n.children().filter(|n| is(*n, "lvl")) {
                        let ilvl = attr(level, "ilvl")
                            .and_then(|v| v.parse::<usize>().ok())
                            .unwrap_or(0);
                        abstracts.insert(
                            (id.to_string(), ilvl),
                            Numbering {
                                ordered: !matches!(val(level, "numFmt"), Some("bullet" | "none")),
                                start: val(level, "start")
                                    .and_then(|v| v.parse().ok())
                                    .unwrap_or(1),
                            },
                        );
                    }
                }
            }
            for n in doc.descendants().filter(|n| is(*n, "num")) {
                if let (Some(id), Some(base)) = (attr(n, "numId"), val(n, "abstractNumId")) {
                    for ((abstract_id, level), def) in &abstracts {
                        if abstract_id == base {
                            numbering.insert((id.into(), *level), def.clone());
                        }
                    }
                    for over in n.children().filter(|n| is(*n, "lvlOverride")) {
                        let level = attr(over, "ilvl").and_then(|v| v.parse().ok()).unwrap_or(0);
                        if let Some(start) = val(over, "startOverride").and_then(|v| v.parse().ok())
                        {
                            numbering
                                .entry((id.into(), level))
                                .or_insert(Numbering {
                                    ordered: true,
                                    start,
                                })
                                .start = start;
                        }
                    }
                }
            }
        }
        Ok((
            Self {
                archive,
                relations,
                styles,
                numbering,
                counters: HashMap::new(),
                assets: vec![],
                asset_hashes: HashMap::new(),
                images: HashMap::new(),
            },
            main,
        ))
    }
}
