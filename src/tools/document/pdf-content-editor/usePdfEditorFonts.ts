import { computed, markRaw, onBeforeUnmount, ref, shallowRef } from "vue";
import fontkit from "@pdf-lib/fontkit";
import { t } from "@/locales";
import { showError } from "@/utils/errorToast";
import { listSystemFonts, readSystemFont, matchingSystemFonts, normalizeFontName, type SystemFont } from "./systemFonts";
import { PDF_TEXT_FEATURES } from "./pdfEditorModel";
import type { EmbeddedPdfFont, OriginalPdfText } from "./pdfTextTypes";
import defaultFontUrl from "@/assets/fonts/NotoSansCJKsc-Regular.otf?url";

interface FontContext {
  generation: () => number;
  allocateId: () => number;
  readEmbeddedFonts: (page: number) => Promise<EmbeddedPdfFont[]>;
}

interface EditorFont {
  id: string;
  label: string;
  bytes: Uint8Array;
  family: string;
  face: FontFace;
  name?: string;
  aliases: string[];
  characters: Set<number>;
  ascent: number;
  descent: number;
  measure: (text: string, size: number) => number;
}

/** 字体资源只在此注册与释放；页面负责选择状态和编辑历史。 */
export function usePdfEditorFonts(context: FontContext) {
  let disposed = false;

  const fonts = shallowRef<EditorFont[]>([]);
  const fontId = ref("default");
  const systemFonts = shallowRef<SystemFont[]>([]);
  let systemFontsReady: Promise<void> | undefined;
  const ensureSystemFonts = () => systemFontsReady ??= listSystemFonts().then((list) => { systemFonts.value = list; }).catch(() => {
    systemFontsReady = undefined;
    showError(t("document.pdfEditSystemFontsFailed"));
  });
  const fontMatches = (font: EditorFont, name: string) => font.aliases.some((alias) => normalizeFontName(alias) === normalizeFontName(name));
  const embeddedFontPages = new Set<number>();
  const hasCharacters = (font: EditorFont, text: string) => [...text].every((char) => /\s/.test(char) || font.characters.has(char.codePointAt(0)!));
  const fontOptions = computed(() => [
    ...fonts.value.filter((font) => !font.id.startsWith("system:")).map((font) => ({ value: font.id, label: font.id === "default" ? t("document.pdfEditBuiltinFont") : font.label })),
    ...systemFonts.value.map((font) => ({ value: `system:${font.id}`, label: t("document.pdfEditSystemFont", { name: font.name }) })),
  ]);
  const addFont = async (bytes: Uint8Array, id: string, label: string, aliases: string[] = []) => {
    const generation = context.generation();
    const parsed = fontkit.create(bytes);
    const family = `OpenToolsPdf_${id}`;
    const face = new FontFace(family, bytes.slice().buffer as ArrayBuffer);
    await face.load();
    if (disposed || generation !== context.generation()) return;
    document.fonts.add(face);
    fonts.value = [...fonts.value, {
      id, label, bytes: markRaw(bytes), family, face,
      name: parsed.postscriptName || undefined,
      aliases: [...aliases, label, parsed.postscriptName, parsed.fullName].filter((name): name is string => !!name),
      characters: new Set<number>(parsed.characterSet),
      ascent: parsed.ascent / parsed.unitsPerEm,
      descent: parsed.descent / parsed.unitsPerEm,
      measure: (text, size) => parsed.layout(text, PDF_TEXT_FEATURES).glyphs
        .reduce((width, glyph) => width + glyph.advanceWidth, 0) * size / parsed.unitsPerEm,
    }];
  };
  const loadSystemFont = async (font: SystemFont) => {
    const id = `system:${font.id}`;
    if (!fonts.value.some((loaded) => loaded.id === id)) {
      await addFont(await readSystemFont(font.id), id, font.name, font.aliases);
    }
    return fonts.value.find((loaded) => loaded.id === id);
  };
  const ensureOriginalFonts = async (index: number) => {
    if (embeddedFontPages.has(index)) return;
    const generation = context.generation();
    const embedded = await context.readEmbeddedFonts(index);
    if (generation !== context.generation() || disposed) return;
    for (const font of embedded) {
      if (fonts.value.some((candidate) => candidate.label === font.name)) continue;
      try { await addFont(font.bytes, `embedded${context.allocateId()}`, font.name); }
      catch { /* 不可直接复用的字体保留原图，实际输入时使用可用字体。 */ }
    }
    if (!disposed && generation === context.generation()) embeddedFontPages.add(index);
  };
  const ensureFont = async () => {
    if (fonts.value.some((font) => font.id === "default")) return;
    const response = await fetch(defaultFontUrl);
    if (!response.ok) throw new Error(t("document.pdfEditFontMissing"));
    await addFont(new Uint8Array(await response.arrayBuffer()), "default", "");
  };
  const resolveOriginalFont = async (run: OriginalPdfText) => {
    const generation = context.generation();
    if (run.fontName) await ensureOriginalFonts(run.page);
    if (disposed || generation !== context.generation()) return;
    let matching: EditorFont | undefined;
    if (run.fontName) {
      // 完整本机字体优先于 PDF 子集，避免输入新字符后丢失原字体。
      await ensureSystemFonts();
      if (disposed || generation !== context.generation()) return;
      for (const candidate of matchingSystemFonts(systemFonts.value, run.fontName, run.bold, run.italic)) {
        try {
          const loaded = await loadSystemFont(candidate);
          if (loaded && hasCharacters(loaded, run.text)) { matching = loaded; break; }
        } catch { /* 单个字体不可嵌入或无法加载时，继续尝试其他同名字体。 */ }
      }
      matching ??= fonts.value.find((font) => {
        const system = systemFonts.value.find((candidate) => `system:${candidate.id}` === font.id);
        return (!system || (system.bold === !!run.bold && system.italic === !!run.italic))
          && fontMatches(font, run.fontName!) && hasCharacters(font, run.text);
      });
    }
    return matching;
  };
  const clearEmbeddedFonts = () => {
    embeddedFontPages.clear();
    for (const font of fonts.value.filter((font) => font.id.startsWith("embedded"))) document.fonts.delete(font.face);
    fonts.value = fonts.value.filter((font) => !font.id.startsWith("embedded"));
  };
  onBeforeUnmount(() => {
    disposed = true;
    for (const font of fonts.value) document.fonts.delete(font.face);
    fonts.value = [];
  });
  return { fonts, fontId, systemFonts, fontOptions, ensureSystemFonts, ensureFont, addFont, loadSystemFont, resolveOriginalFont, clearEmbeddedFonts };
}
