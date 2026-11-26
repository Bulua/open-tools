//! 图片分类高频 AI 工具集合：
//! - `image_info`：查看尺寸、格式、DPI、打印尺寸与主色调
//! - `image_process`：格式转换、压缩、缩放、旋转/翻转、裁剪与无损修改 DPI
//! - `image_stitch`：多图竖向/横向拼接
//! - `image_to_ico`：生成多尺寸 Windows ICO 图标
//! - `image_remove_bg`：调用本机 ONNX 模型 AI 抠图去背景

use std::collections::BTreeSet;
use std::path::PathBuf;

use image::{GenericImageView, ImageFormat};
use serde_json::{json, Value};

use crate::tools::ai::args;
use crate::tools::ai::paths::resolve_target_path;
use crate::tools::ai::registry::{
    AiTool, AiToolContext, AiToolFuture, AiToolResult, ToolApprovalPolicy,
};

use super::dpi;
use super::ops::{
    crop_aspect_ratio, default_output_path, dominant_colors, encode_ico, encode_image,
    format_extension, format_label, load_image_file, parse_format, parse_hex_rgba,
    pick_matting_model, remove_background, resize_image, stitch_images, write_output_bytes,
};

const MAX_STITCH_IMAGES: usize = 30;

fn parse_u32_arg(args: &Value, key: &str) -> Result<Option<u32>, String> {
    let Some(val) = args.get(key) else {
        return Ok(None);
    };
    if val.is_null() {
        return Ok(None);
    }
    val.as_u64()
        .and_then(|v| u32::try_from(v).ok())
        .map(Some)
        .ok_or_else(|| format!("Parameter '{key}' must be a non-negative integer."))
}

pub(crate) struct ImageInfoTool;

impl AiTool for ImageInfoTool {
    fn name(&self) -> &'static str {
        "image_info"
    }

    fn description(&self) -> &'static str {
        "Inspect an image file's metadata: dimensions (width x height), format, file size, color type, alpha channel, DPI (with print size in cm), and dominant hex color palette."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the image file (relative to workspace or absolute)."
                }
            },
            "required": ["path"]
        })
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let Some(raw_path) = args::trimmed(&args, "path") else {
                return AiToolResult::err("Parameter 'path' is required.");
            };
            let (_ws, target, _outside) = match resolve_target_path(ctx.workspace_dir, Some(&raw_path)) {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            let task = tauri::async_runtime::spawn_blocking(move || {
                let (img, format, bytes) = load_image_file(&target)?;
                let (w, h) = img.dimensions();
                let dpi_val = dpi::read_dpi(&bytes);
                let print_cm = dpi_val.map(|(dx, dy)| {
                    json!({
                        "widthCm": dpi::print_size_cm(w, dx),
                        "heightCm": dpi::print_size_cm(h, dy)
                    })
                });
                let palette = dominant_colors(&img, 6);
                let payload = json!({
                    "path": target.to_string_lossy(),
                    "format": format_label(format),
                    "width": w,
                    "height": h,
                    "fileBytes": bytes.len(),
                    "colorType": format!("{:?}", img.color()),
                    "hasAlpha": img.color().has_alpha(),
                    "dpi": dpi_val.map(|(x, y)| json!({ "x": x, "y": y })),
                    "printSize": print_cm,
                    "dominantColors": palette
                });
                serde_json::to_string_pretty(&payload)
                    .map_err(|e| format!("Failed to format image info: {e}"))
            });

            match task.await {
                Ok(Ok(text)) => AiToolResult::ok(text),
                Ok(Err(err)) => AiToolResult::err(err),
                Err(err) => AiToolResult::err(format!("Image inspection task failed: {err}")),
            }
        })
    }
}

pub(crate) struct ImageProcessTool;

impl AiTool for ImageProcessTool {
    fn name(&self) -> &'static str {
        "image_process"
    }

    fn description(&self) -> &'static str {
        "Process an image file: format conversion (png/jpg/webp/bmp/gif/tiff), compression quality, resizing, cropping (pixel rect or centered aspect_ratio like '16:9'), 90/180/270 rotation, horizontal/vertical flip, and DPI setting. When only 'dpi' is specified on a PNG or JPEG without pixel changes, rewrites DPI metadata losslessly without re-encoding."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "input_path": {
                    "type": "string",
                    "description": "Source image path (relative to workspace or absolute)."
                },
                "output_path": {
                    "type": "string",
                    "description": "Destination image path (relative to workspace or absolute). Omit to save inside the workspace with an automatic filename."
                },
                "format": {
                    "type": "string",
                    "enum": ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"],
                    "description": "Target image format. Inferred from output_path extension or source format when omitted."
                },
                "quality": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "description": "JPEG compression quality 1-100 (default 85)."
                },
                "width": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Target width in pixels. Omit height to preserve aspect ratio."
                },
                "height": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Target height in pixels. Omit width to preserve aspect ratio."
                },
                "fit": {
                    "type": "string",
                    "enum": ["contain", "cover", "exact"],
                    "description": "Resize strategy when both width and height are given: 'contain' (default, fit inside), 'cover' (fill and center-crop), or 'exact' (stretch)."
                },
                "rotate": {
                    "type": "integer",
                    "enum": [90, 180, 270],
                    "description": "Clockwise rotation in degrees."
                },
                "flip": {
                    "type": "string",
                    "enum": ["horizontal", "vertical"],
                    "description": "Mirror image horizontally or vertically."
                },
                "crop": {
                    "type": "object",
                    "properties": {
                        "x": { "type": "integer", "minimum": 0 },
                        "y": { "type": "integer", "minimum": 0 },
                        "width": { "type": "integer", "minimum": 1 },
                        "height": { "type": "integer", "minimum": 1 }
                    },
                    "required": ["x", "y", "width", "height"],
                    "description": "Explicit pixel rectangle to crop before rotation/resizing."
                },
                "aspect_ratio": {
                    "type": "string",
                    "description": "Centered aspect-ratio crop (e.g. '16:9', '1:1', '4:3'). Ignored if explicit 'crop' is provided."
                },
                "dpi": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535,
                    "description": "Target DPI metadata for PNG or JPEG output (e.g. 300 for printing)."
                },
                "background": {
                    "type": "string",
                    "description": "Hex background color used when flattening transparency for JPEG/BMP (default '#FFFFFF')."
                }
            },
            "required": ["input_path"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::ExternalWrite
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let Some(input_raw) = args::trimmed(&args, "input_path") else {
                return AiToolResult::err("Parameter 'input_path' is required.");
            };
            let (ws_root, input_path, _) = match resolve_target_path(ctx.workspace_dir, Some(&input_raw)) {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            let output_raw = args::trimmed(&args, "output_path");
            let format_arg = args::trimmed(&args, "format");
            let quality = match parse_u32_arg(&args, "quality") {
                Ok(q) => q.unwrap_or(85).clamp(1, 100) as u8,
                Err(err) => return AiToolResult::err(err),
            };
            let has_explicit_quality = args.get("quality").is_some_and(|v| !v.is_null());
            let width = match parse_u32_arg(&args, "width") {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            let height = match parse_u32_arg(&args, "height") {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            let fit = args::trimmed(&args, "fit")
                .unwrap_or_else(|| "contain".to_string())
                .to_lowercase();
            let rotate = match parse_u32_arg(&args, "rotate") {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            if let Some(deg) = rotate {
                if !matches!(deg, 90 | 180 | 270) {
                    return AiToolResult::err("Parameter 'rotate' must be 90, 180, or 270.");
                }
            }
            let flip = args::trimmed(&args, "flip").map(|s| s.to_lowercase());
            if let Some(ref f) = flip {
                if !matches!(f.as_str(), "horizontal" | "vertical") {
                    return AiToolResult::err("Parameter 'flip' must be 'horizontal' or 'vertical'.");
                }
            }
            let crop_rect = if let Some(obj) = args.get("crop").and_then(Value::as_object) {
                let x = obj.get("x").and_then(Value::as_u64).and_then(|v| u32::try_from(v).ok());
                let y = obj.get("y").and_then(Value::as_u64).and_then(|v| u32::try_from(v).ok());
                let w = obj.get("width").and_then(Value::as_u64).and_then(|v| u32::try_from(v).ok());
                let h = obj.get("height").and_then(Value::as_u64).and_then(|v| u32::try_from(v).ok());
                match (x, y, w, h) {
                    (Some(x), Some(y), Some(w), Some(h)) if w > 0 && h > 0 => Some((x, y, w, h)),
                    _ => {
                        return AiToolResult::err(
                            "Parameter 'crop' requires non-negative integers x, y and positive width, height.",
                        );
                    }
                }
            } else {
                None
            };
            let aspect_ratio = args::trimmed(&args, "aspect_ratio");
            let target_dpi = match parse_u32_arg(&args, "dpi") {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            if let Some(d) = target_dpi {
                if !(dpi::MIN_DPI..=dpi::MAX_DPI).contains(&d) {
                    return AiToolResult::err(format!(
                        "Parameter 'dpi' must be between {} and {}.",
                        dpi::MIN_DPI,
                        dpi::MAX_DPI
                    ));
                }
            }
            let bg_rgba = match args::trimmed(&args, "background") {
                Some(raw) => match parse_hex_rgba(&raw) {
                    Ok(c) => c,
                    Err(err) => return AiToolResult::err(err),
                },
                None => [255, 255, 255, 255],
            };

            let workspace_owned = ctx.workspace_dir.to_string();
            let task = tauri::async_runtime::spawn_blocking(move || {
                let (mut img, src_format, src_bytes) = load_image_file(&input_path)?;
                let (orig_w, orig_h) = img.dimensions();

                let resolved_output: Option<PathBuf> = match output_raw {
                    Some(ref raw) => Some(resolve_target_path(&workspace_owned, Some(raw))?.1),
                    None => None,
                };

                let target_format = if let Some(ref fmt_name) = format_arg {
                    parse_format(fmt_name)
                        .ok_or_else(|| format!("Unsupported format '{fmt_name}'."))?
                } else if let Some(ref out_p) = resolved_output {
                    out_p
                        .extension()
                        .and_then(|e| e.to_str())
                        .and_then(parse_format)
                        .unwrap_or(src_format)
                } else {
                    src_format
                };

                let out_path = resolved_output.unwrap_or_else(|| {
                    let suffix = if target_dpi.is_some()
                        && crop_rect.is_none()
                        && aspect_ratio.is_none()
                        && rotate.is_none()
                        && flip.is_none()
                        && width.is_none()
                        && height.is_none()
                        && target_format == src_format
                    {
                        format!("_{}dpi", target_dpi.unwrap())
                    } else if target_format != src_format {
                        String::new()
                    } else {
                        "_edited".to_string()
                    };
                    default_output_path(&ws_root, &input_path, &suffix, format_extension(target_format))
                });

                // 仅修改 PNG/JPEG 的 DPI 且无像素变换时，走无损字节改写，零画质损失
                let only_dpi = target_dpi.is_some()
                    && crop_rect.is_none()
                    && aspect_ratio.is_none()
                    && rotate.is_none()
                    && flip.is_none()
                    && width.is_none()
                    && height.is_none()
                    && !has_explicit_quality
                    && target_format == src_format
                    && matches!(src_format, ImageFormat::Png | ImageFormat::Jpeg);

                if only_dpi {
                    let d = target_dpi.unwrap();
                    let out_bytes = dpi::write_dpi(&src_bytes, d)?;
                    write_output_bytes(&out_path, &out_bytes)?;
                    let path_str = out_path.to_string_lossy().to_string();
                    let msg = format!(
                        "Updated DPI losslessly to {d} DPI (no pixel re-encoding).\nOutput: {path_str}\nDimensions: {orig_w}x{orig_h} ({} cm x {} cm)\nSize: {} B",
                        dpi::print_size_cm(orig_w, d),
                        dpi::print_size_cm(orig_h, d),
                        out_bytes.len()
                    );
                    return Ok((msg, path_str, out_bytes.len() as u64));
                }

                // 1. 裁剪
                if let Some((x, y, cw, ch)) = crop_rect {
                    let (cur_w, cur_h) = img.dimensions();
                    if x >= cur_w || y >= cur_h {
                        return Err(format!(
                            "Crop origin ({x}, {y}) is outside image bounds ({cur_w}x{cur_h})."
                        ));
                    }
                    let clamped_w = cw.min(cur_w - x);
                    let clamped_h = ch.min(cur_h - y);
                    img = img.crop_imm(x, y, clamped_w, clamped_h);
                } else if let Some(ref ratio) = aspect_ratio {
                    img = crop_aspect_ratio(&img, ratio)?;
                }

                // 2. 旋转与翻转
                if let Some(deg) = rotate {
                    img = match deg {
                        90 => img.rotate90(),
                        180 => img.rotate180(),
                        270 => img.rotate270(),
                        _ => img,
                    };
                }
                if let Some(ref f) = flip {
                    img = match f.as_str() {
                        "horizontal" => img.fliph(),
                        "vertical" => img.flipv(),
                        _ => img,
                    };
                }

                // 3. 缩放
                if width.is_some() || height.is_some() {
                    img = resize_image(&img, width, height, &fit)?;
                }

                let (final_w, final_h) = img.dimensions();
                let out_bytes = encode_image(&img, target_format, quality, bg_rgba, target_dpi)?;
                write_output_bytes(&out_path, &out_bytes)?;

                let dpi_note = target_dpi
                    .map(|d| format!(", {d} DPI"))
                    .unwrap_or_default();
                let path_str = out_path.to_string_lossy().to_string();
                let msg = format!(
                    "Saved processed image to {path_str}\nFormat: {} -> {} ({orig_w}x{orig_h} -> {final_w}x{final_h}{dpi_note})\nSize: {} B -> {} B",
                    format_label(src_format),
                    format_label(target_format),
                    src_bytes.len(),
                    out_bytes.len()
                );
                Ok((msg, path_str, out_bytes.len() as u64))
            });

            match task.await {
                Ok(Ok((msg, path_str, size))) => AiToolResult::ok_with_image(msg, path_str, size),
                Ok(Err(err)) => AiToolResult::err(err),
                Err(err) => AiToolResult::err(format!("Image processing task failed: {err}")),
            }
        })
    }
}

pub(crate) struct ImageStitchTool;

impl AiTool for ImageStitchTool {
    fn name(&self) -> &'static str {
        "image_stitch"
    }

    fn description(&self) -> &'static str {
        "Stitch multiple images (2 to 30) vertically (long screenshot) or horizontally into a single image file."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "input_paths": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 2,
                    "description": "Ordered list of image paths to stitch (relative to workspace or absolute)."
                },
                "output_path": {
                    "type": "string",
                    "description": "Destination output path (defaults to 'stitched.png' inside the workspace)."
                },
                "direction": {
                    "type": "string",
                    "enum": ["vertical", "horizontal"],
                    "description": "Stitch direction: 'vertical' (default) or 'horizontal'."
                },
                "gap": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 500,
                    "description": "Gap between images in pixels (default 0)."
                },
                "align": {
                    "type": "string",
                    "enum": ["start", "center", "end"],
                    "description": "Cross-axis alignment when image sizes differ (default 'center')."
                },
                "match_size": {
                    "type": "boolean",
                    "description": "If true (default), scale images proportionally to share a uniform width (vertical) or height (horizontal)."
                },
                "background": {
                    "type": "string",
                    "description": "Canvas/gap hex color or 'transparent' (default '#FFFFFF')."
                },
                "quality": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "description": "JPEG quality 1-100 when saving as JPG (default 90)."
                }
            },
            "required": ["input_paths"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::ExternalWrite
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let raw_paths = match args::string_vec(&args, "input_paths") {
                Ok(list) => list,
                Err(err) => return AiToolResult::err(err),
            };
            if raw_paths.len() < 2 {
                return AiToolResult::err("Parameter 'input_paths' must contain at least 2 image paths.");
            }
            if raw_paths.len() > MAX_STITCH_IMAGES {
                return AiToolResult::err(format!(
                    "Too many images to stitch ({}, max {MAX_STITCH_IMAGES}).",
                    raw_paths.len()
                ));
            }
            let mut input_paths = Vec::with_capacity(raw_paths.len());
            for raw in raw_paths {
                match resolve_target_path(ctx.workspace_dir, Some(&raw)) {
                    Ok((_, path, _)) => input_paths.push(path),
                    Err(err) => return AiToolResult::err(err),
                }
            }
            let output_raw = args::trimmed(&args, "output_path")
                .unwrap_or_else(|| "stitched.png".to_string());
            let (_, output_path, _) = match resolve_target_path(ctx.workspace_dir, Some(&output_raw)) {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            let direction = args::trimmed(&args, "direction")
                .unwrap_or_else(|| "vertical".to_string())
                .to_lowercase();
            let horizontal = match direction.as_str() {
                "vertical" => false,
                "horizontal" => true,
                other => {
                    return AiToolResult::err(format!(
                        "Unsupported direction '{other}'. Expected 'vertical' or 'horizontal'."
                    ));
                }
            };
            let gap = match parse_u32_arg(&args, "gap") {
                Ok(v) => v.unwrap_or(0).min(500),
                Err(err) => return AiToolResult::err(err),
            };
            let align = args::trimmed(&args, "align")
                .unwrap_or_else(|| "center".to_string())
                .to_lowercase();
            let match_size = args::bool_or(&args, "match_size", true);
            let bg_rgba = match args::trimmed(&args, "background") {
                Some(raw) => match parse_hex_rgba(&raw) {
                    Ok(c) => c,
                    Err(err) => return AiToolResult::err(err),
                },
                None => [255, 255, 255, 255],
            };
            let quality = match parse_u32_arg(&args, "quality") {
                Ok(q) => q.unwrap_or(90).clamp(1, 100) as u8,
                Err(err) => return AiToolResult::err(err),
            };

            let task = tauri::async_runtime::spawn_blocking(
                move || -> Result<(String, String, u64), String> {
                    let mut decoded = Vec::with_capacity(input_paths.len());
                    for path in &input_paths {
                        let (img, _, _) = load_image_file(path)?;
                        decoded.push(img);
                    }
                    let stitched =
                        stitch_images(&decoded, horizontal, gap, &align, match_size, bg_rgba)?;
                    let (w, h) = stitched.dimensions();
                    let format = output_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .and_then(parse_format)
                        .unwrap_or(ImageFormat::Png);
                    let out_bytes = encode_image(&stitched, format, quality, bg_rgba, None)?;
                    write_output_bytes(&output_path, &out_bytes)?;
                    let path_str = output_path.to_string_lossy().to_string();
                    let msg = format!(
                        "Stitched {} images ({}) into {path_str}\nDimensions: {w}x{h} ({}, {} B)",
                        decoded.len(),
                        if horizontal { "horizontal" } else { "vertical" },
                        format_label(format),
                        out_bytes.len()
                    );
                    Ok((msg, path_str, out_bytes.len() as u64))
                },
            );

            match task.await {
                Ok(Ok((msg, path_str, size))) => AiToolResult::ok_with_image(msg, path_str, size),
                Ok(Err(err)) => AiToolResult::err(err),
                Err(err) => AiToolResult::err(format!("Image stitching task failed: {err}")),
            }
        })
    }
}

pub(crate) struct ImageToIcoTool;

impl AiTool for ImageToIcoTool {
    fn name(&self) -> &'static str {
        "image_to_ico"
    }

    fn description(&self) -> &'static str {
        "Convert an image into a multi-resolution Windows .ico icon file (default sizes: 16, 32, 48, 256)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "input_path": {
                    "type": "string",
                    "description": "Source image path (relative to workspace or absolute)."
                },
                "output_path": {
                    "type": "string",
                    "description": "Destination .ico path (defaults to '<name>.ico' in the workspace)."
                },
                "sizes": {
                    "type": "array",
                    "items": { "type": "integer", "minimum": 16, "maximum": 256 },
                    "description": "Icon square resolutions to embed (default [16, 32, 48, 256])."
                },
                "fit": {
                    "type": "string",
                    "enum": ["contain", "cover"],
                    "description": "How non-square images fit into square frames: 'contain' (default, transparent padding) or 'cover' (center-crop)."
                }
            },
            "required": ["input_path"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::ExternalWrite
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let Some(input_raw) = args::trimmed(&args, "input_path") else {
                return AiToolResult::err("Parameter 'input_path' is required.");
            };
            let (ws_root, input_path, _) = match resolve_target_path(ctx.workspace_dir, Some(&input_raw)) {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            let output_path = match args::trimmed(&args, "output_path") {
                Some(raw) => match resolve_target_path(ctx.workspace_dir, Some(&raw)) {
                    Ok((_, p, _)) => p,
                    Err(err) => return AiToolResult::err(err),
                },
                None => default_output_path(&ws_root, &input_path, "", "ico"),
            };

            let sizes: Vec<u32> = if let Some(arr) = args.get("sizes").and_then(Value::as_array) {
                let mut unique = BTreeSet::new();
                for item in arr {
                    let Some(s) = item
                        .as_u64()
                        .and_then(|v| u32::try_from(v).ok())
                        .filter(|&v| (1..=256).contains(&v))
                    else {
                        return AiToolResult::err("Each ICO size must be an integer between 1 and 256.");
                    };
                    unique.insert(s);
                }
                if unique.is_empty() {
                    return AiToolResult::err("Parameter 'sizes' must not be empty.");
                }
                unique.into_iter().collect()
            } else {
                vec![16, 32, 48, 256]
            };

            let fit_cover = args::trimmed(&args, "fit")
                .is_some_and(|f| f.eq_ignore_ascii_case("cover"));

            let task = tauri::async_runtime::spawn_blocking(
                move || -> Result<(String, String, u64), String> {
                    let (img, _, _) = load_image_file(&input_path)?;
                    let ico_bytes = encode_ico(&img, &sizes, fit_cover)?;
                    write_output_bytes(&output_path, &ico_bytes)?;
                    let size_list = sizes
                        .iter()
                        .map(|s| format!("{s}x{s}"))
                        .collect::<Vec<_>>()
                        .join(", ");
                    let path_str = output_path.to_string_lossy().to_string();
                    let msg = format!(
                        "Generated ICO icon at {path_str}\nSizes: [{size_list}] ({} B)",
                        ico_bytes.len()
                    );
                    Ok((msg, path_str, ico_bytes.len() as u64))
                },
            );

            match task.await {
                Ok(Ok((msg, path_str, size))) => AiToolResult::ok_with_image(msg, path_str, size),
                Ok(Err(err)) => AiToolResult::err(err),
                Err(err) => AiToolResult::err(format!("ICO generation task failed: {err}")),
            }
        })
    }
}

pub(crate) struct ImageRemoveBgTool;

impl AiTool for ImageRemoveBgTool {
    fn name(&self) -> &'static str {
        "image_remove_bg"
    }

    fn description(&self) -> &'static str {
        "Remove the background from an image using Open Tools' local ONNX matting models (u2netp, silueta, isnet-general-use, u2net_human_seg). Saves transparent PNG by default, or fills with a solid background hex color (e.g. for ID photos)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "input_path": {
                    "type": "string",
                    "description": "Source image path (relative to workspace or absolute)."
                },
                "output_path": {
                    "type": "string",
                    "description": "Destination output path (defaults to '<name>_nobg.png' in the workspace)."
                },
                "model": {
                    "type": "string",
                    "enum": ["u2netp", "silueta", "isnet-general-use", "u2net_human_seg"],
                    "description": "Optional matting model ID. Omit to auto-select the highest-quality downloaded local model."
                },
                "background": {
                    "type": "string",
                    "description": "Optional solid background hex color (e.g. '#FFFFFF', '#438EDB' for ID photo blue). Omit for transparent PNG."
                }
            },
            "required": ["input_path"]
        })
    }

    fn approval_policy(&self) -> ToolApprovalPolicy {
        ToolApprovalPolicy::ExternalWrite
    }

    fn execute<'a>(&'a self, args: Value, ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let Some(input_raw) = args::trimmed(&args, "input_path") else {
                return AiToolResult::err("Parameter 'input_path' is required.");
            };
            let (ws_root, input_path, _) = match resolve_target_path(ctx.workspace_dir, Some(&input_raw)) {
                Ok(v) => v,
                Err(err) => return AiToolResult::err(err),
            };
            let output_path = match args::trimmed(&args, "output_path") {
                Some(raw) => match resolve_target_path(ctx.workspace_dir, Some(&raw)) {
                    Ok((_, p, _)) => p,
                    Err(err) => return AiToolResult::err(err),
                },
                None => default_output_path(&ws_root, &input_path, "_nobg", "png"),
            };
            let requested_model = args::trimmed(&args, "model");
            let spec = match pick_matting_model(ctx.app, requested_model.as_deref()) {
                Ok(s) => s,
                Err(err) => return AiToolResult::err(err),
            };
            let background = match args::trimmed(&args, "background") {
                Some(raw) => match parse_hex_rgba(&raw) {
                    Ok(c) => Some(c),
                    Err(err) => return AiToolResult::err(err),
                },
                None => None,
            };

            let app = ctx.app.clone();
            let task = tauri::async_runtime::spawn_blocking(
                move || -> Result<(String, String, u64), String> {
                    let (img, _, _) = load_image_file(&input_path)?;
                    let (w, h) = img.dimensions();
                    let result_img = remove_background(&app, &img, spec, background)?;
                    let format = output_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .and_then(parse_format)
                        .unwrap_or(ImageFormat::Png);
                    let out_bytes = encode_image(
                        &result_img,
                        format,
                        92,
                        background.unwrap_or([255, 255, 255, 255]),
                        None,
                    )?;
                    write_output_bytes(&output_path, &out_bytes)?;
                    let bg_desc = match background {
                        Some(c) if c[3] > 0 => format!("#{:02X}{:02X}{:02X}", c[0], c[1], c[2]),
                        _ => "transparent".to_string(),
                    };
                    let path_str = output_path.to_string_lossy().to_string();
                    let msg = format!(
                        "Removed background with model '{}' and saved to {path_str}\nDimensions: {w}x{h}, background: {bg_desc}, format: {}, size: {} B",
                        spec.id,
                        format_label(format),
                        out_bytes.len()
                    );
                    Ok((msg, path_str, out_bytes.len() as u64))
                },
            );

            match task.await {
                Ok(Ok((msg, path_str, size))) => AiToolResult::ok_with_image(msg, path_str, size),
                Ok(Err(err)) => AiToolResult::err(err),
                Err(err) => AiToolResult::err(format!("Background removal task failed: {err}")),
            }
        })
    }
}
