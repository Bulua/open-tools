/** 视频转 GIF 用到的纯函数：取哪些时间点的画面、每帧停留多久、输出尺寸，不依赖界面，便于测试 */

export const FPS_OPTIONS = [5, 10, 15, 20];
export const WIDTH_OPTIONS = [320, 480, 640, 0];
export const COLOR_OPTIONS = [256, 128, 64];
/** 最多多少帧：帧太多时 GIF 很大，转换也很慢；超过时自动降低帧率 */
export const MAX_FRAMES = 600;

/** 实际帧率：视频太长、帧数会超过上限时自动降低帧率，整段视频都转进去，播放速度不变 */
export function effectiveFps(duration: number, fps: number): number {
  return duration * fps > MAX_FRAMES ? MAX_FRAMES / duration : fps;
}

/** 时间段内的帧数：至少 1 帧，最多 MAX_FRAMES 帧 */
export function frameCount(start: number, end: number, fps: number): number {
  return Math.min(MAX_FRAMES, Math.max(1, Math.round((end - start) * fps)));
}

/** 要取画面的时间点（秒），从开始时间起每 1/fps 秒一帧 */
export function frameTimestamps(start: number, end: number, fps: number): number[] {
  return Array.from({ length: frameCount(start, end, fps) }, (_, i) => start + i / fps);
}

/**
 * 每帧停留的毫秒数。GIF 只能记到 10 毫秒，直接四舍五入会让整体变快或变慢（如 15 帧每秒每帧 66.7 毫秒），
 * 这里按累计时间取整，每帧在 60、70 毫秒之间交替，总时长保持准确。
 */
export function frameDelays(count: number, fps: number): number[] {
  const at = (i: number) => Math.round((i * 1000) / fps / 10) * 10;
  return Array.from({ length: count }, (_, i) => at(i + 1) - at(i));
}

/** 输出尺寸：按宽度等比缩放，不放大；宽高都至少 1 像素 */
export function outputSize(srcWidth: number, srcHeight: number, maxWidth: number): { width: number; height: number } {
  if (!maxWidth || maxWidth >= srcWidth) return { width: Math.max(1, srcWidth), height: Math.max(1, srcHeight) };
  return { width: maxWidth, height: Math.max(1, Math.round((srcHeight * maxWidth) / srcWidth)) };
}
