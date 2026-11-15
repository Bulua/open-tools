//! 严格解码及字符到原始字节的映射，未编辑的字节不参与重新编码。
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum Encoding {
    Utf8,
    Utf16Le,
    Utf16Be,
    Gbk,
}

impl Encoding {
    pub fn detect(sample: &[u8], requested: &str) -> Result<(Self, u64), String> {
        let bom = if sample.starts_with(b"\xef\xbb\xbf") {
            Some((Self::Utf8, 3))
        } else if sample.starts_with(b"\xff\xfe") {
            Some((Self::Utf16Le, 2))
        } else if sample.starts_with(b"\xfe\xff") {
            Some((Self::Utf16Be, 2))
        } else {
            None
        };
        if sample.starts_with(b"\xff\xfe\0\0") || sample.starts_with(b"\0\0\xfe\xff") {
            return Err("UTF-32 is not supported".into());
        }
        let explicit = match requested {
            "auto" => None,
            "Utf8" => Some(Self::Utf8),
            "Utf16Le" => Some(Self::Utf16Le),
            "Utf16Be" => Some(Self::Utf16Be),
            "Gbk" => Some(Self::Gbk),
            _ => return Err("Unknown text encoding".into()),
        };
        if let Some((encoding, length)) = bom {
            if explicit.is_some_and(|e| e != encoding) {
                return Err("The selected encoding conflicts with the file BOM".into());
            }
            return Ok((encoding, length));
        }
        if let Some(encoding) = explicit {
            return Ok((encoding, 0));
        }
        if sample.contains(&0) {
            return Err("This looks like a binary file or UTF-16 without a BOM. Select the encoding explicitly".into());
        }
        let utf8 = match std::str::from_utf8(sample) {
            Ok(_) => true,
            Err(e) => e.error_len().is_none(),
        };
        Ok((if utf8 { Self::Utf8 } else { Self::Gbk }, 0))
    }

    /// 截断不完整的尾部字符；同时将块末尾的 CR 留到下一块，避免拆开 CRLF。
    pub fn complete_prefix(self, bytes: &[u8], more: bool) -> Result<usize, String> {
        let mut end = bytes.len();
        if more {
            match self {
                Self::Utf8 => {
                    if let Err(e) = std::str::from_utf8(bytes) {
                        if e.error_len().is_none() {
                            end = e.valid_up_to();
                        } else {
                            return Err("Invalid UTF-8. Reopen with the correct encoding".into());
                        }
                    }
                }
                Self::Utf16Le | Self::Utf16Be => {
                    end -= end % 2;
                    if end >= 2 && (0xd800..=0xdbff).contains(&self.unit(&bytes[end - 2..end])) {
                        end -= 2;
                    }
                }
                Self::Gbk => {
                    let mut at = 0;
                    while at < end {
                        let width = if bytes[at] < 0x81 { 1 } else { 2 };
                        if at + width > end {
                            end = at;
                            break;
                        }
                        at += width;
                    }
                }
            }
        }
        let text = self.decode(&bytes[..end])?;
        if more && text.ends_with('\r') {
            end -= self.width('\r', b"\r");
        }
        Ok(end)
    }
    fn unit(self, b: &[u8]) -> u16 {
        if self == Self::Utf16Be {
            u16::from_be_bytes([b[0], b[1]])
        } else {
            u16::from_le_bytes([b[0], b[1]])
        }
    }
    fn width(self, ch: char, raw: &[u8]) -> usize {
        match self {
            Self::Utf8 => ch.len_utf8(),
            Self::Utf16Le | Self::Utf16Be => ch.len_utf16() * 2,
            Self::Gbk => {
                if raw.first().copied().unwrap_or(0) < 0x81 {
                    1
                } else {
                    2
                }
            }
        }
    }
    pub fn decode(self, bytes: &[u8]) -> Result<String, String> {
        match self {
            Self::Utf8 => std::str::from_utf8(bytes)
                .map(str::to_owned)
                .map_err(|_| "Invalid UTF-8. Reopen with the correct encoding".into()),
            Self::Utf16Le | Self::Utf16Be => {
                if bytes.len() % 2 != 0 {
                    return Err("Incomplete UTF-16 character".into());
                }
                String::from_utf16(
                    &bytes
                        .chunks_exact(2)
                        .map(|b| self.unit(b))
                        .collect::<Vec<_>>(),
                )
                .map_err(|_| "Invalid UTF-16".into())
            }
            Self::Gbk => encoding_rs::GBK
                .decode_without_bom_handling_and_without_replacement(bytes)
                .map(|s| s.into_owned())
                .ok_or_else(|| "Invalid GBK. Reopen with the correct encoding".into()),
        }
    }
    pub fn encode(self, text: &str) -> Result<Vec<u8>, String> {
        match self {
            Self::Utf8 => Ok(text.as_bytes().to_vec()),
            Self::Utf16Le | Self::Utf16Be => Ok(text
                .encode_utf16()
                .flat_map(|u| {
                    if self == Self::Utf16Be {
                        u.to_be_bytes()
                    } else {
                        u.to_le_bytes()
                    }
                })
                .collect()),
            Self::Gbk => {
                let (bytes, _, errors) = encoding_rs::GBK.encode(text);
                if errors {
                    Err("Some characters cannot be saved as GBK. No file was changed".into())
                } else {
                    Ok(bytes.into_owned())
                }
            }
        }
    }
    pub fn normalized(self, bytes: &[u8]) -> Result<Normalized, String> {
        let raw = self.decode(bytes)?;
        let mut chars = raw.chars().peekable();
        let mut text = String::new();
        let mut positions = vec![0usize];
        let mut at = 0;
        while let Some(ch) = chars.next() {
            at += self.width(ch, &bytes[at..]);
            if ch == '\r' {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                    at += self.width('\n', &bytes[at..]);
                }
                text.push('\n');
            } else {
                text.push(ch);
            }
            positions.push(at);
        }
        Ok(Normalized { text, positions })
    }
}
pub struct Normalized {
    pub text: String,
    pub positions: Vec<usize>,
}
