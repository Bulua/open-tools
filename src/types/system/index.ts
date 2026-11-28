/**
 * 系统基础能力（Core）前后端通信类型定义。
 */

export interface BrandingActivatePayload {
  id: string | null;
  png: number[];
  ico: number[];
}

export interface TrayTextPayload {
  show: string;
  quit: string;
  tooltip: string;
  clipboard?: string;
  clipboardToggle?: string;
}
