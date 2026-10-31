/** 颜色转换用到的纯函数，不依赖界面，便于测试 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0 ~ 1 */
  a: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number, digits = 0) => Number(n.toFixed(digits));

/** 解析 #rgb、#rrggbb、#rrggbbaa、rgb()、rgba()、hsl()、hsla()，失败返回 null */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();

  const hex = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255, 2) : 1 };
  }

  const fn = /^(rgba?|hsla?)\(([^)]+)\)$/.exec(s);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (p: string, max: number) => (p.endsWith("%") ? (parseFloat(p) / 100) * max : parseFloat(p));
  const alpha = parts[3] !== undefined ? clamp(num(parts[3], 1), 0, 1) : 1;

  if (fn[1].startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((p) => clamp(Math.round(num(p, 255)), 0, 255));
    if ([r, g, b].some(isNaN)) return null;
    return { r, g, b, a: alpha };
  }

  const h = parseFloat(parts[0]);
  const sat = clamp(parseFloat(parts[1]), 0, 100) / 100;
  const light = clamp(parseFloat(parts[2]), 0, 100) / 100;
  if ([h, sat, light].some(isNaN)) return null;
  return { ...hslToRgb(h, sat, light), a: alpha };
}

function hslToRgb(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

export function rgbToHsl({ r, g, b }: Rgba) {
  const [rr, gg, bb] = [r, g, b].map((v) => v / 255);
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  h *= 60;
  return { h: round(h), s: round(s * 100), l: round(l * 100) };
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

export function toHex(c: Rgba, withAlpha = c.a < 1): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${withAlpha ? hex2(Math.round(c.a * 255)) : ""}`;
}

export function toRgb(c: Rgba): string {
  return c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})` : `rgb(${c.r}, ${c.g}, ${c.b})`;
}

export function toHsl(c: Rgba): string {
  const { h, s, l } = rgbToHsl(c);
  return c.a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${c.a})` : `hsl(${h}, ${s}%, ${l}%)`;
}
