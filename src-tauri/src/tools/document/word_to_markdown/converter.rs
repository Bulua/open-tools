//! 本地 DOCX → Markdown：按正文顺序解析，不调用 Office，也不访问外部资源。
use super::{
    math,
    xml::{attr, child, enabled, html, is, parse, val},
};
use roxmltree::Node;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Cursor, Write};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

pub(super) const MAX_INPUT: usize = 64 * 1024 * 1024;
mod package;
mod table;

use package::{read_entry, MAX_EXPANDED};

#[derive(Clone, Copy)]
enum Mode {
    Markdown,
    Html,
}
#[derive(Default, Clone)]
struct Style {
    parent: Option<String>,
    heading: Option<usize>,
    bold: Option<bool>,
    italic: Option<bool>,
    num: Option<String>,
    level: Option<usize>,
}
#[derive(Clone)]
struct Relation {
    target: String,
    kind: String,
    external: bool,
}
#[derive(Clone)]
struct Numbering {
    ordered: bool,
    start: usize,
}
struct Converter {
    archive: ZipArchive<Cursor<Vec<u8>>>,
    relations: HashMap<String, Relation>,
    styles: HashMap<String, Style>,
    numbering: HashMap<(String, usize), Numbering>,
    counters: HashMap<(String, usize), usize>,
    assets: Vec<(String, Vec<u8>)>,
    asset_hashes: HashMap<[u8; 32], String>,
    images: HashMap<String, String>,
}

fn escape(text: &str, mode: Mode) -> String {
    if matches!(mode, Mode::Html) {
        return html(text);
    }
    let mut out = String::new();
    for c in text.chars() {
        match c {
            '\\' | '`' | '*' | '_' | '[' | ']' | '#' | '!' | '|' | '$' | '~' | '>' | '-' | '+'
            | '.' => {
                out.push('\\');
                out.push(c);
            }
            '<' => out.push_str("&lt;"),
            '&' => out.push_str("&amp;"),
            _ => out.push(c),
        }
    }
    out
}
fn safe_url(value: &str) -> bool {
    if value.chars().any(|c| c.is_control()) {
        return false;
    }
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("mailto:")
        || lower.starts_with('#')
}
fn url(value: &str) -> String {
    value
        .replace(' ', "%20")
        .replace('<', "%3C")
        .replace('>', "%3E")
        .replace('"', "%22")
        .replace('\\', "%5C")
        .replace('|', "%7C")
}
fn style_properties(node: Node<'_, '_>) -> Style {
    let p = child(node, "pPr");
    let r = child(node, "rPr");
    let numbering = p.and_then(|p| child(p, "numPr"));
    Style {
        parent: val(node, "basedOn").map(str::to_string),
        heading: p
            .and_then(|p| val(p, "outlineLvl"))
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|v| *v < 6)
            .map(|v| v + 1),
        bold: r.and_then(|r| enabled(r, "b")),
        italic: r.and_then(|r| enabled(r, "i")),
        num: numbering.and_then(|p| val(p, "numId")).map(str::to_string),
        level: numbering
            .and_then(|p| val(p, "ilvl"))
            .and_then(|v| v.parse().ok()),
    }
}
fn merge_style(base: &mut Style, next: Style) {
    if next.heading.is_some() {
        base.heading = next.heading;
    }
    if next.bold.is_some() {
        base.bold = next.bold;
    }
    if next.italic.is_some() {
        base.italic = next.italic;
    }
    if next.num.is_some() {
        base.num = next.num;
    }
    if next.level.is_some() {
        base.level = next.level;
    }
}

impl Converter {
    fn resolved_style(&self, id: &str) -> Style {
        let mut chain = vec![];
        let mut next = Some(id);
        for _ in 0..16 {
            let Some(style) = next.and_then(|id| self.styles.get(id)) else {
                break;
            };
            chain.push(style.clone());
            next = style.parent.as_deref();
        }
        let mut out = Style::default();
        for style in chain.into_iter().rev() {
            merge_style(&mut out, style);
        }
        out
    }
    fn blocks(&mut self, parent: Node<'_, '_>, mode: Mode) -> Result<String, String> {
        let mut out = String::new();
        for node in parent.children().filter(|n| n.is_element()) {
            match node.tag_name().name() {
                "p" => out += &self.paragraph(node, mode)?,
                "tbl" => out += &self.table(node, mode)?,
                "sdt" => {
                    if let Some(content) = child(node, "sdtContent") {
                        out += &self.blocks(content, mode)?;
                    }
                }
                "ins" | "moveTo" | "customXml" => out += &self.blocks(node, mode)?,
                _ => {}
            }
        }
        Ok(out)
    }
    fn paragraph(&mut self, node: Node<'_, '_>, mode: Mode) -> Result<String, String> {
        let p = child(node, "pPr");
        let mut style = p
            .and_then(|p| val(p, "pStyle"))
            .map(|id| self.resolved_style(id))
            .unwrap_or_default();
        merge_style(&mut style, style_properties(node));
        let text = self.inlines(node, mode, &style)?;
        let text = text.trim();
        if text.is_empty() {
            return Ok(String::new());
        }
        if matches!(mode, Mode::Html) {
            return Ok(format!("<p>{text}</p>\n"));
        }
        let prefix = if let Some(level) = style.heading {
            format!("{} ", "#".repeat(level))
        } else if let Some(id) = style.num.filter(|id| id != "0") {
            let level = style.level.unwrap_or(0).min(8);
            let key = (id.clone(), level);
            let def = self.numbering.get(&key).cloned().unwrap_or(Numbering {
                ordered: false,
                start: 1,
            });
            self.counters
                .retain(|(num, l), _| num != &id || *l <= level);
            let number = self.counters.entry(key).or_insert(def.start);
            let mark = if def.ordered {
                let s = format!("{number}.");
                *number = number.saturating_add(1);
                s
            } else {
                "-".into()
            };
            let indent = "    ".repeat(level);
            let content = text.replace('\n', &format!("\n{indent}    "));
            return Ok(format!("{indent}{mark} {content}\n\n"));
        } else {
            String::new()
        };
        Ok(format!("{prefix}{text}\n\n"))
    }
    fn inlines(
        &mut self,
        parent: Node<'_, '_>,
        mode: Mode,
        style: &Style,
    ) -> Result<String, String> {
        let mut out = String::new();
        let mut previous_run = None;
        for n in parent.children().filter(|n| n.is_element()) {
            let previous = previous_run.take();
            match n.tag_name().name() {
                "t" => out += &escape(n.text().unwrap_or(""), mode),
                "tab" => out.push_str("    "),
                "br" | "cr" => {
                    if !matches!(attr(n, "type"), Some("page" | "column")) {
                        out += if matches!(mode, Mode::Html) {
                            "<br>"
                        } else {
                            "  \n"
                        };
                    }
                }
                "noBreakHyphen" => out.push('‑'),
                "r" => {
                    let props = child(n, "rPr");
                    if props.and_then(|p| enabled(p, "vanish")) == Some(true) {
                        continue;
                    }
                    let mut run_style = style.clone();
                    if let Some(id) = props.and_then(|p| val(p, "rStyle")) {
                        merge_style(&mut run_style, self.resolved_style(id));
                    }
                    if let Some(p) = props {
                        if let Some(b) = enabled(p, "b") {
                            run_style.bold = Some(b);
                        }
                        if let Some(i) = enabled(p, "i") {
                            run_style.italic = Some(i);
                        }
                    }
                    let mut text = self.inlines(n, mode, &Style::default())?;
                    let strike = props.and_then(|p| enabled(p, "strike")) == Some(true);
                    let signature = (
                        run_style.bold == Some(true),
                        run_style.italic == Some(true),
                        strike,
                    );
                    if !text.trim().is_empty() {
                        // 强调标记外保留空格，避免生成无法识别的 Markdown。
                        let lead = text.len() - text.trim_start().len();
                        let tail = text.trim_end().len();
                        let can_join = lead == 0;
                        let continues = tail == text.len();
                        let mut inner = text[lead..tail].to_string();
                        let mut opening = String::new();
                        let mut closing = String::new();
                        for (on, md, tag) in [
                            (strike, "~~", "del"),
                            (run_style.italic == Some(true), "*", "em"),
                            (run_style.bold == Some(true), "**", "strong"),
                        ] {
                            if on {
                                let (start, end) = if matches!(mode, Mode::Html) {
                                    (format!("<{tag}>"), format!("</{tag}>"))
                                } else {
                                    (md.to_string(), md.to_string())
                                };
                                inner = format!("{start}{inner}{end}");
                                opening = format!("{start}{opening}");
                                closing += &end;
                            }
                        }
                        text = format!("{}{inner}{}", &text[..lead], &text[tail..]);
                        // Word 常因校对、语言等原因拆开相同格式的连续文字。
                        if can_join
                            && previous == Some(signature)
                            && !closing.is_empty()
                            && out.ends_with(&closing)
                        {
                            out.truncate(out.len() - closing.len());
                            text.drain(..opening.len());
                        }
                        if continues {
                            previous_run = Some(signature);
                        }
                    }
                    out += &text;
                }
                "hyperlink" => {
                    let label = self.inlines(n, mode, style)?;
                    let target = attr(n, "id")
                        .and_then(|id| self.relations.get(id))
                        .filter(|r| r.kind.ends_with("/hyperlink"))
                        .map(|r| r.target.clone());
                    let target = target.or_else(|| attr(n, "anchor").map(|a| format!("#{a}")));
                    out += &match target.filter(|s| safe_url(s)) {
                        Some(target) if matches!(mode, Mode::Html) => {
                            format!("<a href=\"{}\">{label}</a>", html(&url(&target)))
                        }
                        Some(target) => format!("[{label}](<{}>)", url(&target)),
                        None => label,
                    };
                }
                "drawing" | "pict" => out += &self.image(n, mode)?,
                "bookmarkStart" => {
                    if let Some(name) = attr(n, "name").filter(|s| *s != "_GoBack") {
                        out += &format!("<a id=\"{}\"></a>", html(name));
                    }
                }
                "AlternateContent" => {
                    if let Some(content) = n
                        .children()
                        .find(|n| n.is_element() && n.tag_name().name() == "Choice")
                        .or_else(|| {
                            n.children()
                                .find(|n| n.is_element() && n.tag_name().name() == "Fallback")
                        })
                    {
                        out += &self.inlines(content, mode, style)?;
                    }
                }
                "oMath" | "oMathPara" => {
                    if let Some(value) = math::latex(n).filter(|s| !s.trim().is_empty()) {
                        let value = if matches!(mode, Mode::Html) {
                            html(&value)
                        } else {
                            value
                        };
                        out += &if is(n, "oMathPara") {
                            format!("\n\n$$\n{}\n$$\n\n", value.trim())
                        } else {
                            format!("${}$", value.trim())
                        };
                    }
                }
                "ins" | "moveTo" | "sdtContent" | "smartTag" | "fldSimple" | "customXml" => {
                    out += &self.inlines(n, mode, style)?
                }
                "sdt" => {
                    if let Some(content) = child(n, "sdtContent") {
                        out += &self.inlines(content, mode, style)?;
                    }
                }
                // 文本框、图表、SmartArt、旧公式对象、批注和删除的修订内容不导出。
                _ => {}
            }
        }
        Ok(out)
    }
    fn image(&mut self, drawing: Node<'_, '_>, mode: Mode) -> Result<String, String> {
        // 仅提取图片对象；图表、SmartArt 或文本框中的预览资源不作为正文图片。
        if drawing.descendants().any(|n| {
            ["chart", "relIds", "txbxContent"]
                .iter()
                .any(|name| is(n, name))
        }) {
            return Ok(String::new());
        }
        let Some(id) = drawing.descendants().find_map(|n| {
            if is(n, "blip") {
                attr(n, "embed")
            } else if is(n, "imagedata") {
                attr(n, "id")
            } else {
                None
            }
        }) else {
            return Ok(String::new());
        };
        let Some(rel) = self
            .relations
            .get(id)
            .filter(|r| !r.external && r.kind.ends_with("/image"))
            .cloned()
        else {
            return Ok(String::new());
        };
        let Some(path) = image_path(&rel.target) else {
            return Ok(String::new());
        };
        let name = if let Some(name) = self.images.get(&path) {
            name.clone()
        } else {
            let Some(bytes) = read_entry(&mut self.archive, &path, MAX_EXPANDED)? else {
                return Ok(String::new());
            };
            let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
            if ![
                "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "emf", "wmf",
            ]
            .contains(&ext.as_str())
            {
                return Ok(String::new());
            }
            // 同一图片被多个关系或文件名引用时也只保存一次。
            let hash: [u8; 32] = Sha256::digest(&bytes).into();
            let name = if let Some(name) = self.asset_hashes.get(&hash) {
                name.clone()
            } else {
                let name = format!("assets/image-{:03}.{ext}", self.assets.len() + 1);
                self.assets.push((name.clone(), bytes));
                self.asset_hashes.insert(hash, name.clone());
                name
            };
            self.images.insert(path, name.clone());
            name
        };
        let description = drawing
            .descendants()
            .filter(|n| is(*n, "docPr"))
            .find_map(|n| attr(n, "descr").or_else(|| attr(n, "title")))
            .unwrap_or("");
        Ok(if matches!(mode, Mode::Html) {
            format!("<img src=\"{name}\" alt=\"{}\">", html(description))
        } else {
            format!(
                "![{}]({name})",
                escape(description, mode).replace(['\n', '\r'], " ")
            )
        })
    }
}

fn image_path(target: &str) -> Option<String> {
    if target.contains(['\\', ':', '\0', '?', '#', '%']) {
        return None;
    }
    let mut parts = if target.starts_with('/') {
        vec![]
    } else {
        vec!["word"]
    };
    for part in target.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            _ => parts.push(part),
        }
    }
    let path = parts.join("/");
    path.starts_with("word/media/").then_some(path)
}

fn table_pipes(text: &str) -> String {
    let mut out = String::new();
    let mut slashes = 0;
    for c in text.chars() {
        if c == '|' && slashes % 2 == 0 {
            out.push('\\');
        }
        out.push(c);
        slashes = if c == '\\' { slashes + 1 } else { 0 };
    }
    out
}

pub(super) fn safe_stem(name: &str) -> String {
    let stem = name.rsplit(['/', '\\']).next().unwrap_or("document");
    let stem = stem.rsplit_once('.').map(|(s, _)| s).unwrap_or(stem);
    let stem: String = stem
        .chars()
        .filter(|c| !c.is_control() && !"<>:\"/\\|?*".contains(*c))
        .take(100)
        .collect();
    let stem = stem.trim_matches([' ', '.']);
    let reserved = stem.split('.').next().unwrap_or("").to_ascii_uppercase();
    if stem.is_empty()
        || [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ]
        .contains(&reserved.as_str())
    {
        "document".into()
    } else {
        stem.into()
    }
}

pub(super) fn convert(data: Vec<u8>, name: &str) -> Result<Vec<u8>, String> {
    let (mut converter, xml) = Converter::new(data)?;
    let doc = parse(&xml)?;
    let body = child(doc.root_element(), "body")
        .filter(|_| is(doc.root_element(), "document"))
        .ok_or("DOCX has no document body")?;
    let markdown = converter.blocks(body, Mode::Markdown)?;
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(format!("{}.md", safe_stem(name)), options)
        .map_err(|e| e.to_string())?;
    zip.write_all(markdown.as_bytes())
        .map_err(|e| e.to_string())?;
    for (name, data) in converter.assets {
        zip.start_file(
            name,
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored),
        )
        .map_err(|e| e.to_string())?;
        zip.write_all(&data).map_err(|e| e.to_string())?;
    }
    zip.finish()
        .map(|c| c.into_inner())
        .map_err(|e| e.to_string())
}
