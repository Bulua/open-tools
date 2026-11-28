/**
 * 截图与贴图模块前后端通信类型定义。
 */

export interface ScreenshotItem {
  id: string;
  name: string;
  createdAt: string;
  day: string;
  hour: string;
}

export interface ScreenshotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreenshotTargets {
  width: number;
  height: number;
  windows: ScreenshotRect[];
  viewport: ScreenshotRect;
}

export interface ScreenshotFinishInput {
  draftId: string;
  pngBase64: string;
  pin: boolean;
  copyToClipboard: boolean;
}
