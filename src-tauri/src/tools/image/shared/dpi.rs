//! 无损读写 PNG（`pHYs` 块）与 JPEG（`JFIF APP0` / `EXIF APP1`）DPI 元数据，
//! 直接操作文件字节，不重新解码或重编码像素。

const PNG_SIG: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const INCH_METERS: f64 = 0.0254;

pub(crate) const MIN_DPI: u32 = 1;
pub(crate) const MAX_DPI: u32 = 65_535;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DpiFormat {
    Png,
    Jpeg,
}

pub(crate) fn dpi_format_of(bytes: &[u8]) -> Option<DpiFormat> {
    if bytes.len() >= 8 && bytes[..8] == PNG_SIG {
        return Some(DpiFormat::Png);
    }
    if bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
        return Some(DpiFormat::Jpeg);
    }
    None
}

pub(crate) fn read_dpi(bytes: &[u8]) -> Option<(u32, u32)> {
    match dpi_format_of(bytes)? {
        DpiFormat::Png => read_png_dpi(bytes),
        DpiFormat::Jpeg => read_jpeg_dpi(bytes),
    }
}

pub(crate) fn write_dpi(bytes: &[u8], dpi: u32) -> Result<Vec<u8>, String> {
    let clamped = dpi.clamp(MIN_DPI, MAX_DPI);
    match dpi_format_of(bytes) {
        Some(DpiFormat::Png) => write_png_dpi(bytes, clamped),
        Some(DpiFormat::Jpeg) => Ok(write_jpeg_dpi(bytes, clamped)),
        None => Err("Lossless DPI modification only supports PNG and JPEG images.".to_string()),
    }
}

pub(crate) fn print_size_cm(pixels: u32, dpi: u32) -> f64 {
    if dpi == 0 {
        return 0.0;
    }
    ((f64::from(pixels) / f64::from(dpi)) * 25.4).round() / 10.0
}

fn u16_be(bytes: &[u8], pos: usize) -> u16 {
    u16::from_be_bytes([bytes[pos], bytes[pos + 1]])
}

fn u32_be(bytes: &[u8], pos: usize) -> u32 {
    u32::from_be_bytes([bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]])
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for &byte in data {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            if crc & 1 != 0 {
                crc = 0xedb8_8320 ^ (crc >> 1);
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

// ---------- PNG ----------

struct PngChunk {
    kind: [u8; 4],
    start: usize,
    size: usize,
    data_start: usize,
    data_len: usize,
}

fn png_chunks(bytes: &[u8]) -> Vec<PngChunk> {
    let mut chunks = Vec::new();
    let mut p = 8;
    while p + 12 <= bytes.len() {
        let data_len = u32_be(bytes, p) as usize;
        let Some(size) = 12_usize.checked_add(data_len) else {
            break;
        };
        if p + size > bytes.len() {
            break;
        }
        let kind = [bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]];
        chunks.push(PngChunk {
            kind,
            start: p,
            size,
            data_start: p + 8,
            data_len,
        });
        p += size;
        if &kind == b"IEND" {
            break;
        }
    }
    chunks
}

fn read_png_dpi(bytes: &[u8]) -> Option<(u32, u32)> {
    let phys = png_chunks(bytes)
        .into_iter()
        .find(|c| &c.kind == b"pHYs" && c.data_len >= 9)?;
    if bytes[phys.data_start + 8] != 1 {
        return None;
    }
    let x = (f64::from(u32_be(bytes, phys.data_start)) * INCH_METERS).round() as u32;
    let y = (f64::from(u32_be(bytes, phys.data_start + 4)) * INCH_METERS).round() as u32;
    if x == 0 || y == 0 {
        return None;
    }
    Some((x, y))
}

fn make_phys_chunk(dpi: u32) -> [u8; 21] {
    let ppm = (f64::from(dpi) / INCH_METERS).round() as u32;
    let mut chunk = [0_u8; 21];
    chunk[0..4].copy_from_slice(&9_u32.to_be_bytes());
    chunk[4..8].copy_from_slice(b"pHYs");
    chunk[8..12].copy_from_slice(&ppm.to_be_bytes());
    chunk[12..16].copy_from_slice(&ppm.to_be_bytes());
    chunk[16] = 1;
    let crc = crc32(&chunk[4..17]);
    chunk[17..21].copy_from_slice(&crc.to_be_bytes());
    chunk
}

fn write_png_dpi(bytes: &[u8], dpi: u32) -> Result<Vec<u8>, String> {
    let chunks = png_chunks(bytes);
    let Some(ihdr) = chunks.first() else {
        return Err("Invalid PNG file: missing IHDR chunk.".to_string());
    };
    if &ihdr.kind != b"IHDR" {
        return Err("Invalid PNG file: first chunk is not IHDR.".to_string());
    }
    let mut out = Vec::with_capacity(bytes.len() + 21);
    let after_ihdr = ihdr.start + ihdr.size;
    out.extend_from_slice(&bytes[..after_ihdr]);
    out.extend_from_slice(&make_phys_chunk(dpi));
    let mut cursor = after_ihdr;
    for chunk in chunks.iter().skip(1) {
        if &chunk.kind == b"pHYs" {
            out.extend_from_slice(&bytes[cursor..chunk.start]);
            cursor = chunk.start + chunk.size;
        }
    }
    out.extend_from_slice(&bytes[cursor..]);
    Ok(out)
}

// ---------- JPEG ----------

struct JpegSegment {
    marker: u8,
    data_start: usize,
    data_len: usize,
}

fn jpeg_segments(bytes: &[u8]) -> Vec<JpegSegment> {
    let mut segments = Vec::new();
    let mut p = 2;
    while p + 4 <= bytes.len() && bytes[p] == 0xff {
        let marker = bytes[p + 1];
        if marker == 0xff {
            p += 1;
            continue;
        }
        if marker == 0xda || marker == 0xd9 {
            break;
        }
        let length = usize::from(u16_be(bytes, p + 2));
        if length < 2 || p + 2 + length > bytes.len() {
            break;
        }
        segments.push(JpegSegment {
            marker,
            data_start: p + 4,
            data_len: length - 2,
        });
        p += 2 + length;
    }
    segments
}

fn is_jfif(bytes: &[u8], s: &JpegSegment) -> bool {
    s.marker == 0xe0 && s.data_len >= 14 && &bytes[s.data_start..s.data_start + 5] == b"JFIF\0"
}

fn is_exif(bytes: &[u8], s: &JpegSegment) -> bool {
    s.marker == 0xe1 && s.data_len >= 14 && &bytes[s.data_start..s.data_start + 6] == b"Exif\0\0"
}

fn read_jpeg_dpi(bytes: &[u8]) -> Option<(u32, u32)> {
    let segments = jpeg_segments(bytes);
    if let Some(jfif) = segments.iter().find(|s| is_jfif(bytes, s)) {
        let units = bytes[jfif.data_start + 7];
        let x = u32::from(u16_be(bytes, jfif.data_start + 8));
        let y = u32::from(u16_be(bytes, jfif.data_start + 10));
        if units == 1 && x > 0 && y > 0 {
            return Some((x, y));
        }
        if units == 2 && x > 0 && y > 0 {
            return Some((
                (f64::from(x) * 2.54).round() as u32,
                (f64::from(y) * 2.54).round() as u32,
            ));
        }
    }
    let exif = segments.iter().find(|s| is_exif(bytes, s))?;
    read_exif_dpi(bytes, exif)
}

fn write_jpeg_dpi(bytes: &[u8], dpi: u32) -> Vec<u8> {
    let mut out = bytes.to_vec();
    let segments = jpeg_segments(&out);
    for seg in &segments {
        if is_exif(&out, seg) {
            write_exif_dpi(&mut out, seg, dpi);
        }
    }
    let d = dpi as u16;
    let d_bytes = d.to_be_bytes();
    if let Some(jfif) = segments.iter().find(|s| is_jfif(&out, s)) {
        out[jfif.data_start + 7] = 1;
        out[jfif.data_start + 8..jfif.data_start + 10].copy_from_slice(&d_bytes);
        out[jfif.data_start + 10..jfif.data_start + 12].copy_from_slice(&d_bytes);
        return out;
    }
    let app0: [u8; 18] = [
        0xff, 0xe0, 0x00, 0x10, b'J', b'F', b'I', b'F', 0x00, 0x01, 0x01, 0x01, d_bytes[0],
        d_bytes[1], d_bytes[0], d_bytes[1], 0x00, 0x00,
    ];
    let mut with_app0 = Vec::with_capacity(out.len() + app0.len());
    with_app0.extend_from_slice(&out[..2]);
    with_app0.extend_from_slice(&app0);
    with_app0.extend_from_slice(&out[2..]);
    with_app0
}

// ---------- EXIF ----------

const TAG_X_RESOLUTION: u16 = 0x011a;
const TAG_Y_RESOLUTION: u16 = 0x011b;
const TAG_RESOLUTION_UNIT: u16 = 0x0128;

struct ExifEntry {
    tag: u16,
    kind: u16,
    value_pos: usize,
}

fn rd16(bytes: &[u8], pos: usize, little: bool) -> u16 {
    if little {
        u16::from_le_bytes([bytes[pos], bytes[pos + 1]])
    } else {
        u16::from_be_bytes([bytes[pos], bytes[pos + 1]])
    }
}

fn rd32(bytes: &[u8], pos: usize, little: bool) -> u32 {
    if little {
        u32::from_le_bytes([bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]])
    } else {
        u32::from_be_bytes([bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]])
    }
}

fn wr16(bytes: &mut [u8], pos: usize, val: u16, little: bool) {
    let b = if little {
        val.to_le_bytes()
    } else {
        val.to_be_bytes()
    };
    bytes[pos..pos + 2].copy_from_slice(&b);
}

fn wr32(bytes: &mut [u8], pos: usize, val: u32, little: bool) {
    let b = if little {
        val.to_le_bytes()
    } else {
        val.to_be_bytes()
    };
    bytes[pos..pos + 4].copy_from_slice(&b);
}

fn exif_resolution_entries(bytes: &[u8], seg: &JpegSegment) -> Option<(bool, Vec<ExifEntry>)> {
    let tiff = seg.data_start + 6;
    let end = seg.data_start + seg.data_len;
    if tiff + 8 > end {
        return None;
    }
    let little = bytes[tiff] == 0x49;
    let ifd = tiff.checked_add(rd32(bytes, tiff + 4, little) as usize)?;
    if ifd + 2 > end {
        return None;
    }
    let count = usize::from(rd16(bytes, ifd, little));
    let mut entries = Vec::new();
    for i in 0..count {
        let e = ifd + 2 + i * 12;
        if e + 12 > end {
            break;
        }
        let tag = rd16(bytes, e, little);
        if !matches!(tag, TAG_X_RESOLUTION | TAG_Y_RESOLUTION | TAG_RESOLUTION_UNIT) {
            continue;
        }
        let kind = rd16(bytes, e + 2, little);
        let value_pos = if kind == 5 {
            match tiff.checked_add(rd32(bytes, e + 8, little) as usize) {
                Some(pos) => pos,
                None => continue,
            }
        } else {
            e + 8
        };
        let need = if kind == 5 { 8 } else { 2 };
        if value_pos + need > end {
            continue;
        }
        entries.push(ExifEntry {
            tag,
            kind,
            value_pos,
        });
    }
    Some((little, entries))
}

fn read_exif_dpi(bytes: &[u8], seg: &JpegSegment) -> Option<(u32, u32)> {
    let (little, entries) = exif_resolution_entries(bytes, seg)?;
    let rational = |tag: u16| -> f64 {
        let Some(e) = entries.iter().find(|x| x.tag == tag && x.kind == 5) else {
            return 0.0;
        };
        let den = rd32(bytes, e.value_pos + 4, little);
        if den == 0 {
            0.0
        } else {
            f64::from(rd32(bytes, e.value_pos, little)) / f64::from(den)
        }
    };
    let unit = entries
        .iter()
        .find(|x| x.tag == TAG_RESOLUTION_UNIT && x.kind == 3)
        .map(|e| rd16(bytes, e.value_pos, little))
        .unwrap_or(2);
    let x = rational(TAG_X_RESOLUTION);
    let y = rational(TAG_Y_RESOLUTION);
    if x <= 0.0 || y <= 0.0 || (unit != 2 && unit != 3) {
        return None;
    }
    let scale = if unit == 3 { 2.54 } else { 1.0 };
    Some(((x * scale).round() as u32, (y * scale).round() as u32))
}

fn write_exif_dpi(bytes: &mut [u8], seg: &JpegSegment, dpi: u32) {
    let Some((little, entries)) = exif_resolution_entries(bytes, seg) else {
        return;
    };
    for e in entries {
        if e.kind == 5 && (e.tag == TAG_X_RESOLUTION || e.tag == TAG_Y_RESOLUTION) {
            wr32(bytes, e.value_pos, dpi, little);
            wr32(bytes, e.value_pos + 4, 1, little);
        } else if e.kind == 3 && e.tag == TAG_RESOLUTION_UNIT {
            wr16(bytes, e.value_pos, 2, little);
        }
    }
}
