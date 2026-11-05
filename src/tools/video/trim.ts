/** 视频裁剪用到的纯函数：时间段、时间文字、画面裁剪框，不依赖界面，便于测试 */
import type { Rect } from "@/tools/image/crop";

/** 保留的最短时长（秒） */
export const MIN_LENGTH = 0.1;

/** 把时间段限制在视频范围内，并保证至少 MIN_LENGTH 秒 */
export function clampTrim(start: number, end: number, duration: number): { start: number; end: number } {
  const min = Math.min(MIN_LENGTH, duration);
  const s = Math.min(Math.max(0, start), duration - min);
  return { start: s, end: Math.min(Math.max(s + min, end), duration) };
}

/** 秒数显示为 m:ss.s 或 h:mm:ss.s */
export function formatTime(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor((tenths % 36000) / 600);
  const s = (tenths % 600) / 10;
  const ss = s.toFixed(1).padStart(4, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** 解析用户输入的时间：支持 83.5、1:23.5、1:02:03；格式不对返回 null */
export function parseTime(text: string): number | null {
  const parts = text.trim().replace(/：/g, ":").split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}

/** 画面比例选项，null 表示自由比例 */
export const CROP_RATIOS: { label: string; value: number | null }[] = [
  { label: "", value: null },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
];

/**
 * 编码用的裁剪区域：宽高取偶数（H.264 等编码要求），并限制在画面内。
 * 返回 Mediabunny 需要的 left / top / width / height。
 */
export function encodeCrop(rect: Rect, width: number, height: number): { left: number; top: number; width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  const w = Math.min(even(rect.w), even(width));
  const h = Math.min(even(rect.h), even(height));
  const left = Math.min(Math.max(0, Math.round(rect.x)), width - w);
  const top = Math.min(Math.max(0, Math.round(rect.y)), height - h);
  return { left: Math.max(0, left), top: Math.max(0, top), width: w, height: h };
}

/** 裁剪框是否就是整个画面（等于没有裁剪） */
export const isFullFrame = (rect: Rect, width: number, height: number) => rect.x <= 0 && rect.y <= 0 && rect.w >= width && rect.h >= height;
