//! 稀疏索引每个读取块保留一个字符边界检查点；超长单行也不会产生巨型行对象。
use super::buffer::{Snapshot, BLOCK};
use super::encoding::Encoding;
use serde::Serialize;

#[derive(Clone, Copy, Debug)]
pub struct Point {
    pub offset: u64,
    pub line: u64,
    pub line_start: u64,
}
#[derive(Clone)]
pub struct Index {
    pub revision: u64,
    pub points: Vec<Point>,
    pub scanned: u64,
    pub total: u64,
    pub complete: bool,
    pub lines: u64,
    pub error: Option<String>,
}
impl Index {
    pub fn new(revision: u64, bom: u64, total: u64) -> Self {
        Self {
            revision,
            points: vec![Point {
                offset: bom,
                line: 1,
                line_start: bom,
            }],
            scanned: bom,
            total,
            complete: false,
            lines: 1,
            error: None,
        }
    }
    pub fn seed_offset(&self, at: u64) -> Point {
        *self
            .points
            .iter()
            .rev()
            .find(|p| p.offset <= at)
            .unwrap_or(&self.points[0])
    }
    pub fn seed_line(&self, line: u64) -> Point {
        *self
            .points
            .iter()
            .rev()
            .find(|p| p.line < line)
            .unwrap_or(&self.points[0])
    }
}
pub fn raw_block(view: &Snapshot, encoding: Encoding, at: u64) -> Result<Vec<u8>, String> {
    let mut bytes = view.read(at, BLOCK)?;
    let n = encoding.complete_prefix(&bytes, at + (bytes.len() as u64) < view.len)?;
    if n == 0 && at < view.len {
        return Err("Can't decode the next text block".into());
    }
    bytes.truncate(n);
    Ok(bytes)
}
pub fn advance(mut point: Point, bytes: &[u8], encoding: Encoding) -> Result<Point, String> {
    let decoded = encoding.normalized(bytes)?;
    for (i, ch) in decoded.text.chars().enumerate() {
        if ch == '\n' {
            point.line += 1;
            point.line_start = point.offset + decoded.positions[i + 1] as u64;
        }
    }
    point.offset += bytes.len() as u64;
    Ok(point)
}
/// 从已知安全检查点向前定位，避免随机偏移落在 UTF-8/UTF-16/GBK 字符中间。
pub fn locate(
    view: &Snapshot,
    encoding: Encoding,
    mut point: Point,
    target: u64,
    check: &dyn Fn(u64) -> Result<(), String>,
) -> Result<Point, String> {
    if target > view.len {
        return Err("Text position is outside the document".into());
    }
    while point.offset < target {
        check(point.offset)?;
        let bytes = raw_block(view, encoding, point.offset)?;
        if point.offset + bytes.len() as u64 <= target {
            point = advance(point, &bytes, encoding)?;
            continue;
        }
        let decoded = encoding.normalized(&bytes)?;
        for (i, ch) in decoded.text.chars().enumerate() {
            let end = point.offset + decoded.positions[i + 1] as u64;
            if ch == '\n' {
                point.line += 1;
                point.line_start = end;
            }
            if end >= target {
                point.offset = end;
                return Ok(point);
            }
        }
    }
    Ok(point)
}
pub fn line_offset(
    view: &Snapshot,
    encoding: Encoding,
    mut point: Point,
    line: u64,
    check: &dyn Fn(u64) -> Result<(), String>,
) -> Result<u64, String> {
    if line == 0 {
        return Err("Line numbers start at 1".into());
    }
    if line == 1 {
        return Ok(point.offset);
    }
    while point.offset < view.len {
        check(point.offset)?;
        let bytes = raw_block(view, encoding, point.offset)?;
        let decoded = encoding.normalized(&bytes)?;
        for (i, ch) in decoded.text.chars().enumerate() {
            if ch == '\n' {
                point.line += 1;
                if point.line == line {
                    return Ok(point.offset + decoded.positions[i + 1] as u64);
                }
            }
        }
        point.offset += bytes.len() as u64;
    }
    Err("The requested line is past the end of the document".into())
}
#[derive(Serialize, Debug)]
pub struct Found {
    pub start: u64,
    pub end: u64,
}
pub fn search(
    view: &Snapshot,
    encoding: Encoding,
    mut at: u64,
    needle: &str,
    check: &dyn Fn(u64) -> Result<(), String>,
) -> Result<Option<Found>, String> {
    if needle.is_empty() || needle.len() > 4096 {
        return Err("Search text must be between 1 and 4096 UTF-8 bytes".into());
    }
    let keep = needle.chars().count();
    let mut carry = String::new();
    let mut positions: Vec<u64> = vec![at];
    while at < view.len {
        check(at)?;
        let bytes = raw_block(view, encoding, at)?;
        let block = encoding.normalized(&bytes)?;
        carry.push_str(&block.text);
        positions.extend(block.positions.iter().skip(1).map(|n| at + *n as u64));
        if let Some(byte) = carry.find(needle) {
            let start = carry[..byte].chars().count();
            let end = start + needle.chars().count();
            return Ok(Some(Found {
                start: positions[start],
                end: positions[end],
            }));
        }
        let count = carry.chars().count();
        let discard = count.saturating_sub(keep);
        let byte = carry
            .char_indices()
            .nth(discard)
            .map(|(n, _)| n)
            .unwrap_or(carry.len());
        carry.drain(..byte);
        positions.drain(..discard);
        at += bytes.len() as u64;
    }
    Ok(None)
}
