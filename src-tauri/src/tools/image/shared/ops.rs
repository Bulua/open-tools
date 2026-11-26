//! 后端通用图像处理操作（解码、编码、色彩合成、缩放裁剪、长图拼接、ICO 打包与 AI 抠图）。

use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::codecs::jpeg::JpegEncoder;
use image::imageops::{self, FilterType};
use image::{DynamicImage, GenericImageView, ImageFormat, Rgba, RgbaImage};
use tauri::AppHandle;

use super::{ai_models, dpi, inference};

const MAX_IMAGE_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_OUTPUT_DIMENSION: u32 = 32_768;
const MAX_OUTPUT_PIXELS: u64 = 120_000_000;

/// 已支持的 AI 抠图模型预处理规格（与前端 `aiModels.ts` 保持一致）。
pub(crate) struct MattingModelSpec {
    pub(crate) id: &'static str,
    pub(crate) input_size: u32,
    pub(crate) mean: [f32; 3],
    pub(crate) std: [f32; 3],
}

pub(crate) const MATTING_MODELS: &[MattingModelSpec] = &[
    MattingModelSpec {
        id: "isnet-general-use",
        input_size: 1024,
        mean: [0.5, 0.5, 0.5],
        std: [1.0, 1.0, 1.0],
    },
    MattingModelSpec {
        id: "silueta",
        input_size: 320,
        mean: [0.485, 0.456, 0.406],
        std: [0.229, 0.224, 0.225],
    },
    MattingModelSpec {
        id: "u2net_human_seg",
        input_size: 320,
        mean: [0.485, 0.456, 0.406],
        std: [0.229, 0.224, 0.225],
    },
    MattingModelSpec {
        id: "u2netp",
        input_size: 320,
        mean: [0.485, 0.456, 0.406],
        std: [0.229, 0.224, 0.225],
    },
];

pub(crate) fn matting_spec(id: &str) -> Option<&'static MattingModelSpec> {
    MATTING_MODELS.iter().find(|m| m.id == id)
}

pub(crate) fn parse_format(name: &str) -> Option<ImageFormat> {
    match name.trim().trim_start_matches('.').to_ascii_lowercase().as_str() {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
        "webp" => Some(ImageFormat::WebP),
        "bmp" => Some(ImageFormat::Bmp),
        "gif" => Some(ImageFormat::Gif),
        "ico" => Some(ImageFormat::Ico),
        "tif" | "tiff" => Some(ImageFormat::Tiff),
        _ => None,
    }
}

pub(crate) fn format_extension(format: ImageFormat) -> &'static str {
    match format {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpg",
        ImageFormat::WebP => "webp",
        ImageFormat::Bmp => "bmp",
        ImageFormat::Gif => "gif",
        ImageFormat::Ico => "ico",
        ImageFormat::Tiff => "tiff",
        _ => "png",
    }
}

pub(crate) fn format_label(format: ImageFormat) -> &'static str {
    match format {
        ImageFormat::Png => "PNG",
        ImageFormat::Jpeg => "JPEG",
        ImageFormat::WebP => "WebP",
        ImageFormat::Bmp => "BMP",
        ImageFormat::Gif => "GIF",
        ImageFormat::Ico => "ICO",
        ImageFormat::Tiff => "TIFF",
        _ => "Unknown",
    }
}

/// 解析 `#RGB` / `#RRGGBB` / `#RRGGBBAA` 或 `transparent`。
pub(crate) fn parse_hex_rgba(raw: &str) -> Result<[u8; 4], String> {
    let trimmed = raw.trim();
    if trimmed.eq_ignore_ascii_case("transparent") {
        return Ok([0, 0, 0, 0]);
    }
    let hex = trimmed.strip_prefix('#').unwrap_or(trimmed);
    let parse_byte = |s: &str| {
        u8::from_str_radix(s, 16)
            .map_err(|_| format!("Invalid hex color '{raw}'. Expected #RRGGBB, #RGB, or #RRGGBBAA."))
    };
    match hex.len() {
        3 => {
            let r = parse_byte(&hex[0..1])?;
            let g = parse_byte(&hex[1..2])?;
            let b = parse_byte(&hex[2..3])?;
            Ok([r * 17, g * 17, b * 17, 255])
        }
        6 => Ok([
            parse_byte(&hex[0..2])?,
            parse_byte(&hex[2..4])?,
            parse_byte(&hex[4..6])?,
            255,
        ]),
        8 => Ok([
            parse_byte(&hex[0..2])?,
            parse_byte(&hex[2..4])?,
            parse_byte(&hex[4..6])?,
            parse_byte(&hex[6..8])?,
        ]),
        _ => Err(format!(
            "Invalid hex color '{raw}'. Expected #RRGGBB, #RGB, #RRGGBBAA, or 'transparent'."
        )),
    }
}

pub(crate) fn load_image_file(path: &Path) -> Result<(DynamicImage, ImageFormat, Vec<u8>), String> {
    let meta = std::fs::metadata(path)
        .map_err(|e| format!("Could not access image file {}: {e}", path.display()))?;
    if meta.is_dir() {
        return Err(format!("Path is a directory, not an image file: {}", path.display()));
    }
    if meta.len() > MAX_IMAGE_FILE_BYTES {
        return Err(format!(
            "Image file is too large ({} bytes, limit {} bytes).",
            meta.len(),
            MAX_IMAGE_FILE_BYTES
        ));
    }
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Could not read image file {}: {e}", path.display()))?;
    let format = image::guess_format(&bytes)
        .or_else(|_| ImageFormat::from_path(path))
        .map_err(|e| format!("Unsupported or unrecognized image format for {}: {e}", path.display()))?;
    let img = image::load_from_memory_with_format(&bytes, format)
        .map_err(|e| format!("Failed to decode image {}: {e}", path.display()))?;
    Ok((img, format, bytes))
}

pub(crate) fn write_output_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create output directory {}: {e}", parent.display()))?;
    }
    std::fs::write(path, bytes)
        .map_err(|e| format!("Could not write output file {}: {e}", path.display()))
}

pub(crate) fn default_output_path(
    workspace_dir: &Path,
    input_path: &Path,
    suffix: &str,
    ext: &str,
) -> PathBuf {
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("image");
    workspace_dir.join(format!("{stem}{suffix}.{ext}"))
}

pub(crate) fn flatten_rgba_on_background(rgba: &RgbaImage, bg: [u8; 4]) -> RgbaImage {
    let (w, h) = rgba.dimensions();
    let mut out = RgbaImage::new(w, h);
    let br = f32::from(bg[0]);
    let bg_g = f32::from(bg[1]);
    let bb = f32::from(bg[2]);
    for (x, y, px) in rgba.enumerate_pixels() {
        let a = f32::from(px[3]) / 255.0;
        let inv = 1.0 - a;
        let r = (f32::from(px[0]) * a + br * inv).round().clamp(0.0, 255.0) as u8;
        let g = (f32::from(px[1]) * a + bg_g * inv).round().clamp(0.0, 255.0) as u8;
        let b = (f32::from(px[2]) * a + bb * inv).round().clamp(0.0, 255.0) as u8;
        out.put_pixel(x, y, Rgba([r, g, b, 255]));
    }
    out
}

pub(crate) fn encode_image(
    img: &DynamicImage,
    format: ImageFormat,
    quality: u8,
    background: [u8; 4],
    target_dpi: Option<u32>,
) -> Result<Vec<u8>, String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 || w > MAX_OUTPUT_DIMENSION || h > MAX_OUTPUT_DIMENSION {
        return Err(format!("Output image dimensions ({w}x{h}) are out of allowed bounds."));
    }
    if u64::from(w) * u64::from(h) > MAX_OUTPUT_PIXELS {
        return Err(format!("Output image pixel count ({w}x{h}) exceeds safety limit."));
    }

    let mut buf = Vec::new();
    match format {
        ImageFormat::Jpeg => {
            let flat = DynamicImage::ImageRgba8(flatten_rgba_on_background(&img.to_rgba8(), background)).to_rgb8();
            let mut encoder = JpegEncoder::new_with_quality(&mut buf, quality.clamp(1, 100));
            encoder
                .encode_image(&flat)
                .map_err(|e| format!("Failed to encode JPEG: {e}"))?;
        }
        ImageFormat::Bmp => {
            let flat = DynamicImage::ImageRgba8(flatten_rgba_on_background(&img.to_rgba8(), background)).to_rgb8();
            DynamicImage::ImageRgb8(flat)
                .write_to(&mut Cursor::new(&mut buf), ImageFormat::Bmp)
                .map_err(|e| format!("Failed to encode BMP: {e}"))?;
        }
        ImageFormat::Png | ImageFormat::WebP | ImageFormat::Gif | ImageFormat::Tiff => {
            img.write_to(&mut Cursor::new(&mut buf), format)
                .map_err(|e| format!("Failed to encode {}: {e}", format_label(format)))?;
        }
        other => {
            return Err(format!("Unsupported output format: {}", format_label(other)));
        }
    }

    if let Some(d) = target_dpi {
        if matches!(format, ImageFormat::Png | ImageFormat::Jpeg) {
            return dpi::write_dpi(&buf, d);
        }
    }
    Ok(buf)
}

/// 生成包含多尺寸 PNG 帧的 Windows ICO 文件（支持透明通道与 256×256）。
pub(crate) fn encode_ico(
    img: &DynamicImage,
    sizes: &[u32],
    fit_cover: bool,
) -> Result<Vec<u8>, String> {
    if sizes.is_empty() {
        return Err("At least one icon size is required.".to_string());
    }
    let mut frames: Vec<(u32, Vec<u8>)> = Vec::with_capacity(sizes.len());
    for &size in sizes {
        if size == 0 || size > 256 {
            return Err(format!("Invalid ICO size {size}. Allowed range is 1..=256."));
        }
        let square = render_square_frame(img, size, fit_cover);
        let mut png = Vec::new();
        DynamicImage::ImageRgba8(square)
            .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .map_err(|e| format!("Failed to encode {size}x{size} ICO frame: {e}"))?;
        frames.push((size, png));
    }

    let count = frames.len();
    let header_len = 6 + count * 16;
    let total_len = header_len + frames.iter().map(|(_, p)| p.len()).sum::<usize>();
    let mut out = Vec::with_capacity(total_len);
    // ICONDIR
    out.extend_from_slice(&0_u16.to_le_bytes());
    out.extend_from_slice(&1_u16.to_le_bytes());
    out.extend_from_slice(&(count as u16).to_le_bytes());

    let mut offset = header_len as u32;
    for (size, png) in &frames {
        let dim = if *size >= 256 { 0_u8 } else { *size as u8 };
        out.push(dim);
        out.push(dim);
        out.push(0);
        out.push(0);
        out.extend_from_slice(&1_u16.to_le_bytes());
        out.extend_from_slice(&32_u16.to_le_bytes());
        out.extend_from_slice(&(png.len() as u32).to_le_bytes());
        out.extend_from_slice(&offset.to_le_bytes());
        offset += png.len() as u32;
    }
    for (_, png) in frames {
        out.extend_from_slice(&png);
    }
    Ok(out)
}

fn render_square_frame(img: &DynamicImage, size: u32, fit_cover: bool) -> RgbaImage {
    let (w, h) = img.dimensions();
    if fit_cover {
        let side = w.min(h);
        let x = (w - side) / 2;
        let y = (h - side) / 2;
        let cropped = img.crop_imm(x, y, side, side);
        cropped.resize_exact(size, size, FilterType::Lanczos3).to_rgba8()
    } else {
        let resized = img.resize(size, size, FilterType::Lanczos3).to_rgba8();
        let (rw, rh) = resized.dimensions();
        let mut canvas = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));
        let dx = i64::from((size - rw) / 2);
        let dy = i64::from((size - rh) / 2);
        imageops::overlay(&mut canvas, &resized, dx, dy);
        canvas
    }
}

/// 缩放图像（支持只给宽/高保持比例、contain、cover、exact）。
pub(crate) fn resize_image(
    img: &DynamicImage,
    width: Option<u32>,
    height: Option<u32>,
    fit: &str,
) -> Result<DynamicImage, String> {
    let (src_w, src_h) = img.dimensions();
    let (tw, th) = match (width, height) {
        (Some(w), Some(h)) => (w, h),
        (Some(w), None) => {
            let h = ((f64::from(src_h) * f64::from(w)) / f64::from(src_w))
                .round()
                .max(1.0) as u32;
            (w, h)
        }
        (None, Some(h)) => {
            let w = ((f64::from(src_w) * f64::from(h)) / f64::from(src_h))
                .round()
                .max(1.0) as u32;
            (w, h)
        }
        (None, None) => return Ok(img.clone()),
    };
    if tw == 0 || th == 0 || tw > MAX_OUTPUT_DIMENSION || th > MAX_OUTPUT_DIMENSION {
        return Err(format!("Target resize dimensions ({tw}x{th}) are out of bounds."));
    }
    if u64::from(tw) * u64::from(th) > MAX_OUTPUT_PIXELS {
        return Err(format!("Target resize pixel count ({tw}x{th}) exceeds safety limit."));
    }
    match fit {
        "exact" => Ok(img.resize_exact(tw, th, FilterType::Lanczos3)),
        "cover" => Ok(img.resize_to_fill(tw, th, FilterType::Lanczos3)),
        _ => Ok(img.resize(tw, th, FilterType::Lanczos3)),
    }
}

/// 按比例字符串（如 `"16:9"` / `"1:1"`）居中裁剪。
pub(crate) fn crop_aspect_ratio(img: &DynamicImage, ratio: &str) -> Result<DynamicImage, String> {
    let parts: Vec<&str> = ratio.trim().split([':', '/']).collect();
    if parts.len() != 2 {
        return Err(format!("Invalid aspect_ratio '{ratio}'. Expected format like '16:9' or '1:1'."));
    }
    let rw = parts[0]
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v > 0.0)
        .ok_or_else(|| format!("Invalid width ratio in '{ratio}'."))?;
    let rh = parts[1]
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v > 0.0)
        .ok_or_else(|| format!("Invalid height ratio in '{ratio}'."))?;

    let (w, h) = img.dimensions();
    let target = rw / rh;
    let current = f64::from(w) / f64::from(h);
    let (cw, ch) = if current > target {
        let cw = (f64::from(h) * target).round().clamp(1.0, f64::from(w)) as u32;
        (cw, h)
    } else {
        let ch = (f64::from(w) / target).round().clamp(1.0, f64::from(h)) as u32;
        (w, ch)
    };
    let x = (w - cw) / 2;
    let y = (h - ch) / 2;
    Ok(img.crop_imm(x, y, cw, ch))
}

/// 提取图像主色调色板（按量化色桶统计出现频率最高的若干颜色）。
pub(crate) fn dominant_colors(img: &DynamicImage, limit: usize) -> Vec<String> {
    let thumb = img.resize(64, 64, FilterType::Triangle).to_rgba8();
    let mut buckets: HashMap<(u8, u8, u8), (u64, u64, u64, u64)> = HashMap::new();
    for px in thumb.pixels() {
        if px[3] < 128 {
            continue;
        }
        let key = (px[0] >> 4, px[1] >> 4, px[2] >> 4);
        let entry = buckets.entry(key).or_insert((0, 0, 0, 0));
        entry.0 += 1;
        entry.1 += u64::from(px[0]);
        entry.2 += u64::from(px[1]);
        entry.3 += u64::from(px[2]);
    }
    let mut ranked: Vec<(u64, u64, u64, u64)> = buckets.into_values().collect();
    ranked.sort_by(|a, b| b.0.cmp(&a.0));
    ranked
        .into_iter()
        .take(limit)
        .map(|(cnt, sr, sg, sb)| {
            let r = (sr / cnt) as u8;
            let g = (sg / cnt) as u8;
            let b = (sb / cnt) as u8;
            format!("#{r:02X}{g:02X}{b:02X}")
        })
        .collect()
}

/// 竖向或横向拼接多张图片。
pub(crate) fn stitch_images(
    images: &[DynamicImage],
    horizontal: bool,
    gap: u32,
    align: &str,
    match_size: bool,
    background: [u8; 4],
) -> Result<DynamicImage, String> {
    if images.len() < 2 {
        return Err("At least 2 images are required to stitch.".to_string());
    }

    let prepared: Vec<RgbaImage> = if match_size {
        if horizontal {
            let target_h = images.iter().map(|i| i.height()).max().unwrap_or(1);
            images
                .iter()
                .map(|img| {
                    if img.height() == target_h {
                        img.to_rgba8()
                    } else {
                        let w = ((f64::from(img.width()) * f64::from(target_h))
                            / f64::from(img.height()))
                        .round()
                        .max(1.0) as u32;
                        img.resize_exact(w, target_h, FilterType::Lanczos3).to_rgba8()
                    }
                })
                .collect()
        } else {
            let target_w = images.iter().map(|i| i.width()).max().unwrap_or(1);
            images
                .iter()
                .map(|img| {
                    if img.width() == target_w {
                        img.to_rgba8()
                    } else {
                        let h = ((f64::from(img.height()) * f64::from(target_w))
                            / f64::from(img.width()))
                        .round()
                        .max(1.0) as u32;
                        img.resize_exact(target_w, h, FilterType::Lanczos3).to_rgba8()
                    }
                })
                .collect()
        }
    } else {
        images.iter().map(DynamicImage::to_rgba8).collect()
    };

    let gaps_total = u64::from(gap) * (prepared.len().saturating_sub(1) as u64);
    let (total_w, total_h) = if horizontal {
        let w = prepared
            .iter()
            .map(|i| u64::from(i.width()))
            .sum::<u64>()
            + gaps_total;
        let h = prepared.iter().map(|i| u64::from(i.height())).max().unwrap_or(0);
        (w, h)
    } else {
        let w = prepared.iter().map(|i| u64::from(i.width())).max().unwrap_or(0);
        let h = prepared
            .iter()
            .map(|i| u64::from(i.height()))
            .sum::<u64>()
            + gaps_total;
        (w, h)
    };

    if total_w == 0
        || total_h == 0
        || total_w > u64::from(MAX_OUTPUT_DIMENSION)
        || total_h > u64::from(MAX_OUTPUT_DIMENSION)
        || total_w * total_h > MAX_OUTPUT_PIXELS
    {
        return Err(format!(
            "Stitched canvas dimensions ({total_w}x{total_h}) exceed safety limits."
        ));
    }

    let mut canvas = RgbaImage::from_pixel(total_w as u32, total_h as u32, Rgba(background));
    let mut cursor: i64 = 0;
    for img in &prepared {
        let (iw, ih) = img.dimensions();
        if horizontal {
            let dy = match align {
                "center" => i64::from((total_h as u32 - ih) / 2),
                "end" => i64::from(total_h as u32 - ih),
                _ => 0,
            };
            imageops::overlay(&mut canvas, img, cursor, dy);
            cursor += i64::from(iw) + i64::from(gap);
        } else {
            let dx = match align {
                "center" => i64::from((total_w as u32 - iw) / 2),
                "end" => i64::from(total_w as u32 - iw),
                _ => 0,
            };
            imageops::overlay(&mut canvas, img, dx, cursor);
            cursor += i64::from(ih) + i64::from(gap);
        }
    }

    Ok(DynamicImage::ImageRgba8(canvas))
}

/// 查找可用的本机已下载 AI 抠图模型（未指定时按精细度优先自动选择）。
pub(crate) fn pick_matting_model(
    app: &AppHandle,
    requested: Option<&str>,
) -> Result<&'static MattingModelSpec, String> {
    if !ai_models::runtime_ready(app) {
        return Err(
            "Local AI runtime is not ready yet. Please open the '图片去背景' (Remove Background) tool in Open Tools and download a matting model first."
                .to_string(),
        );
    }
    if let Some(id) = requested {
        let spec = matting_spec(id).ok_or_else(|| {
            let valid = MATTING_MODELS
                .iter()
                .map(|m| m.id)
                .collect::<Vec<_>>()
                .join(", ");
            format!("Unknown matting model '{id}'. Supported models: {valid}.")
        })?;
        ai_models::model_path(app, spec.id).map_err(|_| {
            format!(
                "Matting model '{}' is not downloaded yet. Please download it in the '图片去背景' tool first.",
                spec.id
            )
        })?;
        return Ok(spec);
    }
    for spec in MATTING_MODELS {
        if ai_models::model_path(app, spec.id).is_ok() {
            return Ok(spec);
        }
    }
    Err(
        "No local matting model is downloaded yet. Please open the '图片去背景' (Remove Background) tool in Open Tools and download one of: u2netp, silueta, isnet-general-use, or u2net_human_seg."
            .to_string(),
    )
}

/// 复用本机 ONNX Runtime 模型执行前景抠图（与前端 `segment.ts` 前后处理一致）。
pub(crate) fn remove_background(
    app: &AppHandle,
    img: &DynamicImage,
    spec: &MattingModelSpec,
    background: Option<[u8; 4]>,
) -> Result<DynamicImage, String> {
    let size = spec.input_size;
    let resized = img
        .resize_exact(size, size, FilterType::Triangle)
        .to_rgba8();
    let n = (size as usize) * (size as usize);

    let mut max_val = 1e-6_f32;
    for px in resized.pixels() {
        max_val = max_val
            .max(f32::from(px[0]))
            .max(f32::from(px[1]))
            .max(f32::from(px[2]));
    }

    let mut tensor = vec![0.0_f32; 3 * n];
    for (idx, px) in resized.pixels().enumerate() {
        for c in 0..3 {
            tensor[c * n + idx] = (f32::from(px[c]) / max_val - spec.mean[c]) / spec.std[c];
        }
    }

    let output = inference::run_f32(
        app,
        spec.id,
        vec![(vec![1, 3, size as usize, size as usize], tensor)],
    )?;
    if output.len() < n {
        return Err("Unexpected matting model output size.".to_string());
    }

    let slice = &output[..n];
    let mut min_v = f32::INFINITY;
    let mut max_v = f32::NEG_INFINITY;
    for &v in slice {
        if v < min_v {
            min_v = v;
        }
        if v > max_v {
            max_v = v;
        }
    }
    let range = if (max_v - min_v).abs() < f32::EPSILON {
        1.0
    } else {
        max_v - min_v
    };

    let mut mask_small = image::GrayImage::new(size, size);
    for (i, pixel) in mask_small.pixels_mut().enumerate() {
        let v = (((slice[i] - min_v) / range) * 255.0)
            .round()
            .clamp(0.0, 255.0) as u8;
        pixel.0 = [v];
    }

    let (orig_w, orig_h) = img.dimensions();
    let mask_full = imageops::resize(&mask_small, orig_w, orig_h, FilterType::Triangle);

    let mut rgba = img.to_rgba8();
    for (x, y, px) in rgba.enumerate_pixels_mut() {
        let m = u32::from(mask_full.get_pixel(x, y).0[0]);
        px[3] = ((u32::from(px[3]) * m + 127) / 255) as u8;
    }

    let final_rgba = match background {
        Some(bg) if bg[3] > 0 => flatten_rgba_on_background(&rgba, bg),
        _ => rgba,
    };
    Ok(DynamicImage::ImageRgba8(final_rgba))
}
