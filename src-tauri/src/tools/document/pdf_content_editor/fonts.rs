//! 通过 Windows 字体映射器枚举和读取字体，不接受前端传入文件路径。
use serde::Serialize;
use std::{ptr::null_mut, sync::OnceLock};
use windows_sys::Win32::Graphics::Gdi::*;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontInfo {
    pub id: usize,
    pub family: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub postscript_names: Vec<String>,
    pub weight: i32,
    pub bold: bool,
    pub italic: bool,
}
struct Entry {
    info: FontInfo,
    logical: LOGFONTW,
}
static CATALOG: OnceLock<Vec<Entry>> = OnceLock::new();

struct Context {
    dc: HDC,
    font: HFONT,
    previous: HGDIOBJ,
}
impl Context {
    fn new(logical: Option<&LOGFONTW>) -> Result<Self, String> {
        unsafe {
            let dc = CreateCompatibleDC(null_mut());
            if dc.is_null() {
                return Err("Cannot create font device context".into());
            }
            let mut context = Self {
                dc,
                font: null_mut(),
                previous: null_mut(),
            };
            if let Some(logical) = logical {
                context.font = CreateFontIndirectW(logical);
                if context.font.is_null() {
                    return Err("Cannot load system font".into());
                }
                context.previous = SelectObject(dc, context.font);
                if context.previous.is_null() || context.previous as isize == -1 {
                    return Err("Cannot select system font".into());
                }
            }
            Ok(context)
        }
    }
    fn table(&self, tag: u32) -> Result<Vec<u8>, String> {
        unsafe {
            let size = GetFontData(self.dc, tag, 0, null_mut(), 0);
            if size == GDI_ERROR as u32 || size == 0 || size > 64 * 1024 * 1024 {
                return Err("System font data is unavailable or unsupported".into());
            }
            let mut bytes = vec![0; size as usize];
            if GetFontData(self.dc, tag, 0, bytes.as_mut_ptr().cast(), size) != size {
                return Err("Cannot read system font data".into());
            }
            Ok(bytes)
        }
    }
}
impl Drop for Context {
    fn drop(&mut self) {
        unsafe {
            if !self.previous.is_null() && self.previous as isize != -1 {
                SelectObject(self.dc, self.previous);
            }
            if !self.font.is_null() {
                DeleteObject(self.font);
            }
            DeleteDC(self.dc);
        }
    }
}
fn wide(value: &[u16]) -> String {
    String::from_utf16_lossy(&value[..value.iter().position(|c| *c == 0).unwrap_or(value.len())])
}
unsafe extern "system" fn collect(
    font: *const LOGFONTW,
    _: *const TEXTMETRICW,
    kind: u32,
    data: isize,
) -> i32 {
    if kind & TRUETYPE_FONTTYPE == 0 {
        return 1;
    }
    let extended = &*(font as *const ENUMLOGFONTEXW);
    if extended.elfLogFont.lfFaceName[0] != b'@' as u16 {
        (*(data as *mut Vec<ENUMLOGFONTEXW>)).push(*extended);
    }
    1
}
fn enumerate() -> Result<Vec<Entry>, String> {
    let context = Context::new(None)?;
    let mut logical = LOGFONTW {
        lfCharSet: DEFAULT_CHARSET,
        ..Default::default()
    };
    let mut families = Vec::<ENUMLOGFONTEXW>::new();
    unsafe {
        EnumFontFamiliesExW(
            context.dc,
            &logical,
            Some(collect),
            &mut families as *mut _ as isize,
            0,
        );
    }
    let mut all = Vec::<ENUMLOGFONTEXW>::new();
    let mut seen = std::collections::HashSet::new();
    for family in families {
        if !seen.insert(wide(&family.elfLogFont.lfFaceName)) {
            continue;
        }
        logical.lfFaceName = family.elfLogFont.lfFaceName;
        unsafe {
            EnumFontFamiliesExW(
                context.dc,
                &logical,
                Some(collect),
                &mut all as *mut _ as isize,
                0,
            );
        }
    }
    seen.clear();
    let mut entries = Vec::new();
    for font in all {
        let family = wide(&font.elfLogFont.lfFaceName);
        let name = wide(&font.elfFullName);
        let bold = font.elfLogFont.lfWeight >= 600;
        let italic = font.elfLogFont.lfItalic != 0;
        if !seen.insert(format!("{name}:{bold}:{italic}")) {
            continue;
        }
        let mut aliases = vec![name.clone(), family.clone()];
        let mut postscript_names = Vec::new();
        if let Ok(context) = Context::new(Some(&font.elfLogFont)) {
            if let Ok(table) = context.table(u32::from_le_bytes(*b"name")) {
                aliases.extend(names(&table, false));
                postscript_names = names(&table, true);
            }
        }
        aliases.sort();
        aliases.dedup();
        entries.push(Entry {
            info: FontInfo {
                id: entries.len(),
                family,
                name,
                aliases,
                postscript_names,
                weight: font.elfLogFont.lfWeight,
                bold,
                italic,
            },
            logical: font.elfLogFont,
        });
    }
    if entries.is_empty() {
        return Err("No readable Windows outline fonts were found".into());
    }
    Ok(entries)
}
fn catalog() -> Result<&'static Vec<Entry>, String> {
    if let Some(entries) = CATALOG.get() {
        return Ok(entries);
    }
    let entries = enumerate()?;
    let _ = CATALOG.set(entries);
    Ok(CATALOG.get().unwrap())
}
pub fn list() -> Result<Vec<FontInfo>, String> {
    Ok(catalog()?.iter().map(|e| e.info.clone()).collect())
}

fn word(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_be_bytes(
        bytes.get(offset..offset + 2)?.try_into().ok()?,
    ))
}
fn names(bytes: &[u8], postscript_only: bool) -> Vec<String> {
    let mut result = Vec::new();
    let count = word(bytes, 2).unwrap_or(0) as usize;
    let start = word(bytes, 4).unwrap_or(0) as usize;
    for index in 0..count {
        let at = 6 + index * 12;
        if postscript_only && word(bytes, at + 6) != Some(6) {
            continue;
        }
        if !matches!(word(bytes, at), Some(0 | 3))
            || !matches!(word(bytes, at + 6), Some(1 | 4 | 6 | 16))
        {
            continue;
        }
        if let (Some(length), Some(offset)) = (word(bytes, at + 8), word(bytes, at + 10)) {
            if let Some(value) =
                bytes.get(start + offset as usize..start + offset as usize + length as usize)
            {
                result.push(String::from_utf16_lossy(
                    &value
                        .chunks_exact(2)
                        .map(|c| u16::from_be_bytes([c[0], c[1]]))
                        .collect::<Vec<_>>(),
                ));
            }
        }
    }
    result
}

pub fn read(id: usize) -> Result<Vec<u8>, String> {
    let entry = catalog()?.get(id).ok_or("Unknown system font")?;
    let context = Context::new(Some(&entry.logical))?;
    let mut face = [0u16; 128];
    unsafe {
        GetTextFaceW(context.dc, face.len() as i32, face.as_mut_ptr());
    }
    if wide(&face).to_lowercase() != entry.info.family.to_lowercase() {
        return Err("Windows substituted the requested font".into());
    }
    if let Ok(os2) = context.table(u32::from_le_bytes(*b"OS/2")) {
        // 仅可打印预览、禁止嵌入、禁止子集或仅允许位图的字体不能用于当前导出流程。
        if word(&os2, 8).unwrap_or(0) & (0x0002 | 0x0100 | 0x0200) != 0
            || word(&os2, 8).unwrap_or(0) & 0x000c == 0x0004
        {
            return Err("This font does not permit editable subset embedding".into());
        }
    }
    let raw = context.table(0)?;
    // TTC 共享表的偏移可能指向集合其他位置，逐表读取并重新封装为独立 sfnt。
    let count = word(&raw, 4).ok_or("Invalid font header")? as usize;
    let header_size = 12 + count * 16;
    if count == 0 || raw.len() < header_size {
        return Err("Invalid font directory".into());
    }
    let mut output = raw[..header_size].to_vec();
    let mut head = None;
    for index in 0..count {
        let at = 12 + index * 16;
        let tag: [u8; 4] = raw[at..at + 4].try_into().unwrap();
        let mut table = context.table(u32::from_le_bytes(tag))?;
        if tag == *b"head" && table.len() >= 12 {
            table[8..12].fill(0);
            head = Some(output.len() + 8);
        }
        let offset = output.len();
        output[at + 4..at + 8].copy_from_slice(&checksum(&table).to_be_bytes());
        output[at + 8..at + 12].copy_from_slice(&(offset as u32).to_be_bytes());
        output[at + 12..at + 16].copy_from_slice(&(table.len() as u32).to_be_bytes());
        output.extend_from_slice(&table);
        while output.len() % 4 != 0 {
            output.push(0);
        }
        if output.len() > 64 * 1024 * 1024 {
            return Err("System font is too large".into());
        }
    }
    if let Some(head) = head {
        let adjustment = 0xb1b0afbau32.wrapping_sub(checksum(&output));
        output[head..head + 4].copy_from_slice(&adjustment.to_be_bytes());
    }
    Ok(output)
}
fn checksum(bytes: &[u8]) -> u32 {
    bytes.chunks(4).fold(0u32, |sum, chunk| {
        let mut word = [0; 4];
        word[..chunk.len()].copy_from_slice(chunk);
        sum.wrapping_add(u32::from_be_bytes(word))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn validate_tables(bytes: &[u8]) {
        assert_eq!(checksum(bytes), 0xb1b0afba);
        for index in 0..word(bytes, 4).unwrap() as usize {
            let at = 12 + index * 16;
            let offset = u32::from_be_bytes(bytes[at + 8..at + 12].try_into().unwrap()) as usize;
            let length = u32::from_be_bytes(bytes[at + 12..at + 16].try_into().unwrap()) as usize;
            assert_eq!(offset % 4, 0);
            assert!(offset + length <= bytes.len());
            if &bytes[at..at + 4] == b"name" {
                assert!(!names(&bytes[offset..offset + length], false).is_empty());
            }
        }
    }
    #[test]
    fn installed_fonts_have_valid_standalone_data() {
        let fonts = list().unwrap();
        let font = fonts
            .iter()
            .find(|f| f.family.eq_ignore_ascii_case("Arial") && !f.bold && !f.italic)
            .unwrap();
        let bytes = read(font.id).unwrap();
        validate_tables(&bytes);
        assert!(word(&bytes, 4).unwrap() > 0);
        assert!(read(usize::MAX).is_err());
    }
    #[test]
    fn chinese_collection_faces_are_readable_when_installed() {
        for font in list().unwrap().iter().filter(|font| {
            font.aliases.iter().any(|name| {
                matches!(
                    name.as_str(),
                    "Microsoft YaHei" | "SimSun" | "微软雅黑" | "宋体"
                )
            })
        }) {
            let bytes = read(font.id).unwrap();
            validate_tables(&bytes);
            assert!(bytes.len() > 100_000);
        }
    }
}
