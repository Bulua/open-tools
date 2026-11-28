import { documentApi } from "@/api/document";
import type { SystemFont } from "@/types/document";

export type { SystemFont };
export const normalizeFontName = (name: string) => name.replace(/^[A-Z]{6}\+/, "").replace(/[\s_,.-]/g, "").toLowerCase();

/** 完整名称优先，家族名必须同时匹配字重和斜体；不将近似字体冒充原字体。 */
export function matchingSystemFonts(fonts: SystemFont[], name: string, bold = false, italic = false) {
  const wanted = normalizeFontName(name);
  const score = (font: SystemFont) =>
    Number(!!font.postscriptNames?.some((alias) => normalizeFontName(alias) === wanted)) * 10000
    + Number(normalizeFontName(font.name) === wanted) * 2000
    - Math.abs((font.weight ?? (font.bold ? 700 : 400)) - (bold ? 700 : 400));
  return fonts.filter((font) => font.bold === bold && font.italic === italic && font.aliases.some((alias) => normalizeFontName(alias) === wanted))
    .sort((a, b) => score(b) - score(a));
}

export async function listSystemFonts(): Promise<SystemFont[]> {
  return documentApi.listSystemFonts();
}

export async function readSystemFont(id: number) {
  const data = await documentApi.readSystemFont(id);
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
}
