<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowUpRight, Circle, FilePenLine, Highlighter, ImagePlus, Move, LoaderCircle, MousePointer2, PenLine, Redo2, Save, Square, Trash2, Type, Undo2, X, ZoomIn, ZoomOut, Minus, SlidersHorizontal, Upload } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { boxOf, glide } from "@/utils/motion";
import { saveFile } from "@/utils/saveFile";
import { showError } from "@/utils/errorToast";
import { openPdf, type PdfDocument } from "../shared/pdfjs";
import { loadPdf } from "../shared/pdf";
import { readPdfOutline, resolveOutlinePage, type PdfOutlineEntry } from "./pdfOutline";
import { createPdfTextClient } from "./pdfTextClient";
import type { OriginalPdfText } from "./pdfTextTypes";
import { exportEditedPdf } from "./pdfEditor";
import { arrowHeadPoints, arrowHeadSize, clampObject, cloneEditObjects, createEditHistory, originalState, pristineOriginal, textLines, type EditKind, type EditPoint, type PdfEditObject, type PdfEditPage } from "./pdfEditorModel";
import { usePdfEditorFonts } from "./usePdfEditorFonts";
import { usePdfPagePreview, type PdfEditorSource } from "./usePdfPagePreview";

const { t } = useI18n();
const source = shallowRef<PdfEditorSource>();
const pages = ref<PdfEditPage[]>([]);
const pageIndex = ref(0);
const zoom = ref(1);
const loading = ref(false), exporting = ref(false);
const mode = ref<"select" | "original" | EditKind>("select");
const objects = ref<PdfEditObject[]>([]);
const selectedId = ref<number>();
const selected = computed(() => objects.value.find((item) => item.id === selectedId.value));
const metadata = computed(() => pages.value[pageIndex.value]);
const stage = shallowRef<HTMLElement>();
const pageElements = new Map<number, HTMLElement>();
const visiblePages = ref<number[]>([0]);
const setPageElement = (element: unknown, index: number) => {
  if (element instanceof HTMLElement) {
    pageElements.set(index, element);
    if (index === pageIndex.value) stage.value = element;
  } else pageElements.delete(index);
};
const scrollPages = () => {
  if (!canvasScroll.value || gesture) return;
  const bounds = canvasScroll.value.getBoundingClientRect();
  if (!bounds.height) return;
  const anchor = bounds.top + Math.min(180, bounds.height * 0.3);
  let nearest = pageIndex.value, distance = Infinity;
  const visible: number[] = [];
  for (const [index, element] of pageElements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom >= bounds.top - bounds.height && rect.top <= bounds.bottom + bounds.height) visible.push(index);
    const delta = anchor < rect.top ? rect.top - anchor : anchor > rect.bottom ? anchor - rect.bottom : 0;
    if (delta < distance) { distance = delta; nearest = index; }
  }
  if (visible.length && visible.join() !== visiblePages.value.join()) visiblePages.value = visible;
  if (nearest !== pageIndex.value) { finishText(); endProperty(); pageIndex.value = nearest; }
};
const activatePage = async (event: PointerEvent, index: number, item?: PdfEditObject, resize = false, forceMove = false) => {
  if (index !== pageIndex.value) {
    event.preventDefault(); finishText(); endProperty(); pageIndex.value = index;
    await nextTick();
  }
  begin(event, item, resize, forceMove);
};
const canvasScroll = ref<HTMLElement>();
const workspace = ref<HTMLElement>();
const navigationWidth = ref(170);
const navigationLimit = () => Math.min(420, Math.max(140, (workspace.value?.clientWidth || 900) - 320));
let navigationDrag: { pointer: number; x: number; width: number } | undefined;
const resizeNavigation = (event: PointerEvent) => {
  if (!navigationDrag || event.pointerId !== navigationDrag.pointer) return;
  navigationWidth.value = Math.min(navigationLimit(), Math.max(140, navigationDrag.width + event.clientX - navigationDrag.x));
};
const beginNavigationResize = (event: PointerEvent) => {
  if (event.button !== 0) return;
  event.preventDefault();
  navigationDrag = { pointer: event.pointerId, x: event.clientX, width: navigationWidth.value };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};
const endNavigationResize = (event: PointerEvent, cancel = false) => {
  if (navigationDrag?.pointer !== event.pointerId) return;
  if (cancel) navigationWidth.value = navigationDrag.width;
  navigationDrag = undefined;
  const handle = event.currentTarget as HTMLElement;
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
};
const resizeNavigationKey = (event: KeyboardEvent) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  navigationWidth.value = event.key === "Home" ? 140 : event.key === "End" ? navigationLimit() : Math.min(navigationLimit(), Math.max(140, navigationWidth.value + (event.key === "ArrowRight" ? 10 : -10)));
};
const outline = shallowRef<PdfOutlineEntry[]>([]);
const navigation = ref<"thumbnails" | "outline">("thumbnails");
const navigationPanel = ref<HTMLElement>();
watch([pageIndex, navigation], async () => {
  await nextTick();
  const panel = navigationPanel.value;
  if (!panel || navigation.value !== "thumbnails") return;
  const thumbnail = panel.querySelector<HTMLElement>(`[data-page="${pageIndex.value}"]`);
  if (!thumbnail) return;
  const bounds = panel.getBoundingClientRect(), target = thumbnail.getBoundingClientRect();
  if (!bounds.height) return;
  const top = bounds.top + (panel.querySelector(".navigation-tabs")?.getBoundingClientRect().height || 0) + 10;
  const bottom = bounds.bottom - 10;
  if (target.top < top) panel.scrollTop += target.top - top;
  else if (target.bottom > bottom) panel.scrollTop += target.bottom - bottom;
});
const editingId = ref<number>();
const originalText = shallowRef(new Map<number, OriginalPdfText[]>());
const readingOriginal = ref(false), removingOriginal = ref(false);
const redactedDoc = shallowRef<PdfDocument>();
const originalIds = computed(() => [...new Set(objects.value.flatMap((item) => item.originalId && !pristineOriginal(item) ? [item.originalId] : []))].sort());
const currentOriginalText = computed(() => (originalText.value.get(pageIndex.value) ?? []).filter((run) => !objects.value.some((item) => item.originalId === run.id)));
let textClient: ReturnType<typeof createPdfTextClient> | undefined;
let originalReadToken = 0, removalToken = 0;
let successfulOriginalIds = new Set<string>();
const { rendering, pageImages, pageRemovedIds, pageUrl, thumbs, observeThumb, reset: resetPreview } = usePdfPagePreview({
  source, pages, pageIndex, zoom, redactedDoc, visiblePages,
  removedIds: () => successfulOriginalIds,
  onLayout: scrollPages,
});
const ensureTextClient = () => textClient ??= createPdfTextClient(source.value!.data);
let textSnapshot: PdfEditObject[] | undefined;
const history = createEditHistory();
const revision = ref(0);
const canUndo = computed(() => { void revision.value; return history.canUndo; });
const canRedo = computed(() => { void revision.value; return history.canRedo; });
const palette = ["#141413", "#c96442", "#b5412f", "#4c7a4f", "#3b5a7a", "#f3d34a"];
const color = ref(palette[0]);
const defaultSize = ref(18);
const defaultStroke = ref(2);
const defaultArrowHeadSize = ref(24);
const loadingFont = ref(false), preparingOriginal = ref(false);
const { fonts, fontId, systemFonts, fontOptions, ensureSystemFonts, ensureFont, addFont, loadSystemFont, resolveOriginalFont, clearEmbeddedFonts } = usePdfEditorFonts({
  generation: () => token,
  allocateId: () => nextId++,
  readEmbeddedFonts: (page) => ensureTextClient().fonts(page),
});
let nextId = 1, token = 0, disposed = false;
let propertySnapshot: PdfEditObject[] | undefined;
const copyObjects = (): PdfEditObject[] => cloneEditObjects(objects.value);
const commitHistory = (snapshot: PdfEditObject[] = copyObjects()) => { history.push(snapshot.filter((item) => !pristineOriginal(item))); revision.value++; };
const finishText = (preserve?: PdfEditObject) => {
  if (editingId.value === undefined) return;
  const id = editingId.value, snapshot = textSnapshot;
  editingId.value = undefined; textSnapshot = undefined;
  const item = objects.value.find((item) => item.id === id);
  if (item && item !== preserve && (pristineOriginal(item) || (!item.originalId && !item.text?.trim()))) objects.value = objects.value.filter((item) => item.id !== id);
  if (snapshot && JSON.stringify(snapshot.filter((item) => !pristineOriginal(item))) !== JSON.stringify(objects.value.filter((item) => !pristineOriginal(item)))) commitHistory(snapshot);
};
const blurText = (event: FocusEvent) => {
  if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest(".format-toolbar")) return;
  finishText();
};
const editText = async (item: PdfEditObject, snapshot?: PdfEditObject[]) => {
  if (item.kind !== "text" || exporting.value) return;
  finishText(); endProperty();
  mode.value = "text"; selectedId.value = item.id;
  textSnapshot = snapshot ?? copyObjects(); editingId.value = item.id;
  await nextTick();
  stage.value?.querySelector<HTMLTextAreaElement>(".inline-text")?.focus();
};
const textWidth = (item: PdfEditObject) => {
  const font = fonts.value.find((font) => font.id === item.fontId), size = item.fontSize || 18;
  return Math.max(0, ...textLines((item.text || "").replace(/\t/g, "    ")).map((line) =>
    (font?.measure(line, size) ?? 0) + [...line].length * (item.characterSpacing || 0)));
};
const growText = (item: PdfEditObject, event: Event) => {
  const textarea = event.target as HTMLTextAreaElement;
  const page = pages.value[item.page], size = item.fontSize || 18, scale = item.horizontalScale || 1;
  const lines = textLines(textarea.value), width = textWidth({ ...item, text: textarea.value });
  item.width = Math.min(page.width - item.x, Math.max(item.width, (item.textOriginX || 0) + width * scale + 2));
  item.height = Math.min(page.height - item.y, Math.max(item.height, lines.length * (item.lineHeight || size * 1.25)));
  // 粘贴与输入法提交时先同步扩宽 DOM，再复位浏览器按旧宽度产生的内部滚动。
  textarea.style.width = `${Math.max(item.width / scale, width + 2) * zoom.value}px`;
  textarea.scrollLeft = 0; textarea.scrollTop = 0;
  void nextTick(() => { if (textarea.isConnected) { textarea.scrollLeft = 0; textarea.scrollTop = 0; } });
};

const startProperty = () => { propertySnapshot ??= copyObjects(); };
const endProperty = () => {
  if (!propertySnapshot) return;
  if (selected.value && metadata.value) {
    const item = selected.value;
    Object.assign(item, clampObject(item, metadata.value));
    item.fontSize = Math.min(144, Math.max(6, Number(item.fontSize) || 18));
    item.opacity = Math.min(1, Math.max(0.05, Number(item.opacity) || 0.05));
    item.strokeWidth = Math.min(20, Math.max(0.5, Number(item.strokeWidth) || 2));
    if (item.kind === "arrow") item.arrowHeadSize = arrowHeadSize(item.arrowHeadSize);
  }
  if (JSON.stringify(propertySnapshot) !== JSON.stringify(objects.value)) commitHistory(propertySnapshot);
  propertySnapshot = undefined;
};
const update = (patch: Partial<PdfEditObject>) => {
  endProperty(); if (!selected.value) return;
  commitHistory(); Object.assign(selected.value, patch);
};
const remove = () => {
  if (selected.value && pristineOriginal(selected.value)) { editingId.value = undefined; textSnapshot = undefined; }
  else finishText();
  endProperty(); if (!selected.value) return; commitHistory();
  if (selected.value.originalId) selected.value.text = "";
  else objects.value = objects.value.filter((item) => item.id !== selectedId.value);
  selectedId.value = undefined;
};
const undo = () => { finishText(); endProperty(); const previous = history.undo(objects.value); if (previous) { objects.value = previous; selectedId.value = undefined; revision.value++; } };
const redo = () => { finishText(); endProperty(); const next = history.redo(objects.value); if (next) { objects.value = next; selectedId.value = undefined; revision.value++; } };
const goToPage = (index: number) => {
  finishText(); endProperty(); selectedId.value = undefined; pageIndex.value = index;
  const element = pageElements.get(index), first = pageElements.get(0);
  if (canvasScroll.value && element && first) canvasScroll.value.scrollTop = element.offsetTop - first.offsetTop;
  visiblePages.value = [index];
};
const followOutline = async (entry: PdfOutlineEntry) => {
  const src = source.value, current = token;
  if (!src) return;
  try {
    const index = await resolveOutlinePage(src.doc, entry.destination);
    if (index !== undefined && current === token && !disposed) goToPage(index);
  } catch (error) { if (current === token && !disposed) showError(error); }
};
const changeZoom = async (value: number, anchor?: { x: number; y: number }) => {
  if (gesture || exporting.value || !source.value) return;
  const next = Math.max(0.25, Math.min(2, Math.round(value * 100) / 100));
  if (next === zoom.value) return;
  finishText(); endProperty();
  const container = canvasScroll.value, before = stage.value?.getBoundingClientRect();
  const rect = container?.getBoundingClientRect();
  const target = anchor ?? (rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
  const point = before && target ? { x: (target.x - before.left) / zoom.value, y: (target.y - before.top) / zoom.value } : undefined;
  zoom.value = next;
  await nextTick();
  const after = stage.value?.getBoundingClientRect();
  if (container && after && target && point) {
    container.scrollLeft += after.left + point.x * next - target.x;
    container.scrollTop += after.top + point.y * next - target.y;
  }
};
const onWheel = (event: WheelEvent) => {
  if (!event.ctrlKey || !source.value) return;
  event.preventDefault();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvasScroll.value?.clientHeight || 800 : 1);
  void changeZoom(zoom.value * Math.exp(-delta * 0.0015), { x: event.clientX, y: event.clientY });
};

let fontSelection = 0;
const selectFont = async (id: string) => {
  const request = ++fontSelection, generation = token, item = selected.value;
  loadingFont.value = true;
  try {
    const system = systemFonts.value.find((font) => `system:${font.id}` === id);
    if (system) await loadSystemFont(system);
    if (generation !== token || request !== fontSelection || disposed || selected.value !== item) return;
    if (item?.kind === "text") update({ fontId: id }); else fontId.value = id;
  } catch { showError(t("document.pdfEditSystemFontFailed")); }
  finally { if (request === fontSelection) loadingFont.value = false; }
};
const fontInput = ref<HTMLInputElement>(), imageInput = ref<HTMLInputElement>();
const importFont = async (event: Event) => {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
  if (!file) return;
  try { const id = `font${nextId++}`; await addFont(new Uint8Array(await file.arrayBuffer()), id, file.name.replace(/\.[^.]+$/, "")); fontId.value = id; if (selected.value?.kind === "text") update({ fontId: id }); }
  catch (error) { showError(error); }
};
const reset = () => {
  token++;
  resetPreview();
  originalReadToken++; removalToken++;
  textClient?.destroy(); textClient = undefined;
  void redactedDoc.value?.destroy(); redactedDoc.value = undefined;
  originalText.value = new Map(); successfulOriginalIds.clear(); preparingOriginal.value = false;
  clearEmbeddedFonts();
  readingOriginal.value = false; removingOriginal.value = false;
  pageElements.clear(); stage.value = undefined; visiblePages.value = [0];
  void source.value?.doc.destroy(); source.value = undefined;
  pages.value = []; objects.value = []; selectedId.value = undefined; pageIndex.value = 0;
  history.clear(); revision.value++; propertySnapshot = undefined;
  editingId.value = undefined; textSnapshot = undefined;
  outline.value = []; navigation.value = "thumbnails";
  gesture = undefined;
};
const open = async (files: File[]) => {
  const file = files[0]; if (!file || loading.value) return;
  loading.value = true;
  const current = ++token;
  let doc: PdfDocument | undefined;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    await loadPdf(data);
    doc = await openPdf(data);
    const info: PdfEditPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), viewport = page.getViewport({ scale: 1 });
      info.push({ width: viewport.width, height: viewport.height, transform: [...viewport.transform] });
    }
    await ensureFont();
    await ensureSystemFonts();
    const bookmarks = await readPdfOutline(doc).catch((error) => { if (current === token && !disposed) showError(error); return []; });
    if (current !== token || disposed) { await doc.destroy(); return; }
    source.value = { name: file.name, data, doc }; pages.value = info; outline.value = bookmarks;
  } catch (error) { await doc?.destroy(); if (!disposed) showError(error); }
  finally { loading.value = false; }
};
watch(pageIndex, () => {
  finishText(); endProperty(); selectedId.value = undefined;
  stage.value = pageElements.get(pageIndex.value);
});
watch([pageIndex, source], async () => {
  const current = ++originalReadToken;
  readingOriginal.value = false;
  if (!source.value || originalText.value.has(pageIndex.value)) return;
  const index = pageIndex.value;
  readingOriginal.value = true;
  try {
    const runs = await ensureTextClient().read(index);
    if (current === originalReadToken && !disposed) originalText.value = new Map(originalText.value).set(index, runs);
  } catch (error) { if (current === originalReadToken && !disposed) showError(error); }
  finally { if (current === originalReadToken) readingOriginal.value = false; }
});
watch(() => originalIds.value.join("|"), () => {
  const current = ++removalToken, generation = token;
  const preview = (async () => {
    if (!source.value) return;
    if (!originalIds.value.length) {
      void redactedDoc.value?.destroy(); redactedDoc.value = undefined; successfulOriginalIds.clear(); removingOriginal.value = false; return;
    }
    removingOriginal.value = true;
    try {
      const data = await ensureTextClient().remove([...originalIds.value]);
      const doc = await openPdf(data);
      if (current !== removalToken || generation !== token || disposed) { await doc.destroy(); return; }
      void redactedDoc.value?.destroy(); redactedDoc.value = doc;
      successfulOriginalIds = new Set(originalIds.value);
    } catch (error) { if (current === removalToken && generation === token && !disposed) throw error; }
    finally { if (current === removalToken) removingOriginal.value = false; }
  })();
  // 预览失败时回退本次替换；导出仍独立校验与移除原文。
  void preview.catch((error) => {
    if (current !== removalToken || disposed) return;
    const rejected = objects.value.filter((item) => item.originalId && !pristineOriginal(item) && !successfulOriginalIds.has(item.originalId));
    if (rejected.some((item) => item.id === editingId.value)) { editingId.value = undefined; textSnapshot = undefined; }
    objects.value = objects.value.filter((item) => !rejected.includes(item));
    showError(error);
  });
});
const editOriginal = async (run: OriginalPdfText) => {
  if (readingOriginal.value || removingOriginal.value || preparingOriginal.value || exporting.value) return;
  if (!run.supported) { showError(t("document.pdfEditUnsupportedOriginal")); return; }
  finishText(); endProperty();
  const snapshot = copyObjects(), generation = token, intentMode = mode.value;
  preparingOriginal.value = true;
  try {
    const matching = run.fontName ? await resolveOriginalFont(run) : undefined;
    if (generation !== token || disposed || mode.value !== intentMode || pageIndex.value !== run.page) return;
    const item = clampObject({ ...fresh("text", { x: run.x, y: run.y }), originalId: run.id, originalFontName: run.fontName, text: run.text, fontId: matching?.id || "default", fontSize: run.fontSize, color: run.color,
      baseline: run.baseline === undefined ? undefined : run.baseline - run.y, lineHeight: run.lineHeight,
      textOriginX: run.originX === undefined ? 0 : run.originX - run.x, characterSpacing: run.characterSpacing, horizontalScale: run.horizontalScale,
      width: Math.min(metadata.value.width - run.x, Math.max(run.width + 2, 4)), height: Math.max(run.height, run.text.split("\n").length * (run.lineHeight || run.fontSize * 1.25)) }, metadata.value);
    item.originalState = originalState(item);
    objects.value.push(item);
    await editText(item, snapshot);
  } catch (error) { if (generation === token && !disposed) showError(error); }
  finally { if (generation === token) preparingOriginal.value = false; }
};
const toolStrip = ref<HTMLElement>();
const tools = computed(() => [
  { id: "select", icon: MousePointer2 }, { id: "text", icon: Type }, { id: "original", icon: FilePenLine }, { id: "image", icon: ImagePlus },
  { id: "signature", icon: PenLine }, { id: "highlight", icon: Highlighter }, { id: "rectangle", icon: Square },
  { id: "ellipse", icon: Circle }, { id: "line", icon: Minus }, { id: "arrow", icon: ArrowUpRight },
] as const);
// 在 Vue 更新选中状态之前记录旧位置，使用公共滑动高亮。
watch(mode, async () => {
  const container = toolStrip.value, previous = container?.querySelector<HTMLElement>("button.primary");
  if (!container || !previous) return;
  const from = boxOf(previous);
  await nextTick();
  const current = container.querySelector<HTMLElement>("button.primary");
  if (current && current !== previous) glide(container, from, boxOf(current), "pill");
});
const showTextControls = computed(() => selected.value ? selected.value.kind === "text" : ["text", "original"].includes(mode.value));
const showStrokeControls = computed(() => ["signature", "rectangle", "ellipse", "line", "arrow"].includes(selected.value?.kind ?? mode.value));
const propertyTool = computed(() => tools.value.find((tool) => tool.id === (selected.value?.originalId ? "original" : selected.value?.kind ?? mode.value)) ?? tools.value[0]);
const chooseMode = (tool: typeof mode.value) => {
  finishText(); endProperty();
  if (tool === "image") { imageInput.value?.click(); return; }
  mode.value = tool; selectedId.value = undefined;
};
const fresh = (kind: EditKind, point: EditPoint): PdfEditObject => ({ id: nextId++, page: pageIndex.value, kind, x: point.x, y: point.y, width: kind === "text" ? 220 : 120, height: kind === "text" ? defaultSize.value * 1.6 : 60, color: kind === "highlight" ? palette[5] : color.value, opacity: kind === "highlight" ? 0.3 : 1, strokeWidth: defaultStroke.value, arrowHeadSize: kind === "arrow" ? arrowHeadSize(defaultArrowHeadSize.value) : undefined, text: kind === "text" ? "" : undefined, fontId: fontId.value, fontSize: defaultSize.value });
const addObject = (item: PdfEditObject) => { commitHistory(); objects.value.push(clampObject(item, pages.value[item.page])); selectedId.value = item.id; };
const importImage = async (event: Event) => {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
  if (!file || !metadata.value) return;
  const targetPage = pageIndex.value, generation = token, targetMetadata = { ...metadata.value };
  try {
    const url = URL.createObjectURL(file), image = new Image();
    try {
      image.src = url; await image.decode();
      if (generation !== token || disposed || !source.value) return;
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const ratio = canvas.width / canvas.height;
      const width = Math.min(targetMetadata.width * 0.5, 240, targetMetadata.height * 0.5 * ratio), height = width / ratio;
      pageIndex.value = targetPage;
      addObject({ ...fresh("image", { x: 30, y: 30 }), page: targetPage, width, height, image: canvas.toDataURL("image/png") }); mode.value = "select";
    } finally { URL.revokeObjectURL(url); }
  } catch (error) { showError(error); }
};

interface Gesture { pointer: number; kind: "move" | "resize" | "draw"; start: EditPoint; item: PdfEditObject; snapshot: PdfEditObject[]; points: EditPoint[] }
let gesture: Gesture | undefined;
const pointAt = (event: PointerEvent): EditPoint => {
  const rect = stage.value!.getBoundingClientRect();
  return { x: Math.max(0, Math.min(metadata.value.width, (event.clientX - rect.left) / zoom.value)), y: Math.max(0, Math.min(metadata.value.height, (event.clientY - rect.top) / zoom.value)) };
};
const begin = (event: PointerEvent, item?: PdfEditObject, resize = false, forceMove = false) => {
  if (event.button !== 0 || (rendering.value && !pageUrl.value) || exporting.value || !metadata.value) return;
  // 拖动或缩放未修改原文时保留临时对象，不能在失焦处理中提前删除。
  finishText(item && (forceMove || resize || mode.value === "select") ? item : undefined); endProperty();
  const point = pointAt(event), snapshot = copyObjects();
  if (mode.value === "original" && !forceMove && !resize) { event.preventDefault(); if (item?.kind === "text") void editText(item); return; }
  if (item && (mode.value === "select" || forceMove || resize)) {
    selectedId.value = item.id;
    gesture = { pointer: event.pointerId, kind: resize ? "resize" : "move", start: point, item: { ...item }, snapshot, points: [] };
  } else if (!item && mode.value === "select") { selectedId.value = undefined; return; }
  else if (mode.value === "text") {
    // 阻止这次按下的默认焦点行为，否则浏览器会把刚获得焦点的输入框再次移出焦点。
    event.preventDefault();
    if (item?.kind === "text") { void editText(item); return; }
    const text = clampObject(fresh("text", point), metadata.value);
    objects.value.push(text); void editText(text, snapshot); return;
  }
  else if (mode.value !== "select" && mode.value !== "image" && mode.value !== "original") {
    const drawing = fresh(mode.value, point); drawing.width = 4; drawing.height = 4;
    objects.value.push(drawing); selectedId.value = drawing.id;
    gesture = { pointer: event.pointerId, kind: "draw", start: point, item: { ...drawing }, snapshot, points: [point] };
  }
  if (gesture) { event.preventDefault(); stage.value?.setPointerCapture(event.pointerId); }
};
const move = (event: PointerEvent) => {
  const active = gesture; if (!active || active.pointer !== event.pointerId) return;
  const point = pointAt(event), item = objects.value.find((item) => item.id === active.item.id); if (!item) return;
  const dx = point.x - active.start.x, dy = point.y - active.start.y;
  if (active.kind === "move") Object.assign(item, clampObject({ ...active.item, x: active.item.x + dx, y: active.item.y + dy }, metadata.value));
  else if (active.kind === "resize") {
    let width = active.item.width + dx, height = active.item.height + dy;
    if (item.kind === "image" || item.kind === "signature") { const ratio = active.item.width / active.item.height; width = Math.max(4, Math.abs(dx) >= Math.abs(dy) ? width : height * ratio); height = width / ratio; }
    Object.assign(item, clampObject({ ...active.item, width, height }, metadata.value));
  } else {
    if (item.kind === "signature") active.points.push(point);
    const points = item.kind === "signature" ? active.points : [active.start, point];
    const left = Math.min(...points.map((p) => p.x)), top = Math.min(...points.map((p) => p.y));
    const width = Math.max(4, Math.max(...points.map((p) => p.x)) - left), height = Math.max(4, Math.max(...points.map((p) => p.y)) - top);
    Object.assign(item, { x: left, y: top, width, height, points: points.map((p) => ({ x: (p.x - left) / width, y: (p.y - top) / height })) });
  }
};
const finish = (event: PointerEvent, cancel = false) => {
  if (!gesture || gesture.pointer !== event.pointerId) return;
  const active = gesture; gesture = undefined;
  const drawing = objects.value.find((item) => item.id === active.item.id);
  if (cancel || (active.kind === "draw" && (!drawing?.points || drawing.points.length < 2))) objects.value = active.snapshot;
  else if (JSON.stringify(active.snapshot) !== JSON.stringify(objects.value)) commitHistory(active.snapshot);
  objects.value = objects.value.filter((item) => !pristineOriginal(item));
  if (!objects.value.some((item) => item.id === selectedId.value)) selectedId.value = undefined;
  if (stage.value?.hasPointerCapture(event.pointerId)) stage.value.releasePointerCapture(event.pointerId);
  if (active.kind === "draw" && active.item.kind !== "signature") mode.value = "select";
};
const objectStyle = (item: PdfEditObject) => ({ left: `${item.x * zoom.value}px`, top: `${item.y * zoom.value}px`, width: `${item.width * zoom.value}px`, height: `${item.height * zoom.value}px`, opacity: item.opacity, color: item.color });
const pointsAttribute = (item: PdfEditObject) => (item.points ?? []).map((p) => `${p.x * item.width},${p.y * item.height}`).join(" ");
const arrowHead = (item: PdfEditObject) => arrowHeadPoints(item).map((point) => `${point.x},${point.y}`).join(" ");
const originalStillVisible = (item: PdfEditObject) => !!item.originalId && !pageRemovedIds.value.get(item.page)?.has(item.originalId);
const textStyle = (item: PdfEditObject) => {
  const font = fonts.value.find((font) => font.id === item.fontId);
  const size = item.fontSize || 18, leading = item.lineHeight || size * 1.25;
  const baseline = leading / 2 + ((font?.ascent || 0.8) + (font?.descent || -0.2)) * size / 2;
  const scale = item.horizontalScale || 1;
  return { fontFamily: `"${family(item.fontId)}"`, fontSize: `${size * zoom.value}px`, lineHeight: `${leading * zoom.value}px`,
    letterSpacing: `${(item.characterSpacing || 0) * zoom.value}px`, transform: `scaleX(${scale})`, transformOrigin: "left top",
    width: `${Math.max(item.width / scale, textWidth(item) + 2) * zoom.value}px`,
    position: "relative" as const, left: `${(item.textOriginX || 0) * zoom.value}px`, top: `${item.baseline === undefined ? 0 : (item.baseline - baseline) * zoom.value}px` };
};
const family = (id?: string) => fonts.value.find((font) => font.id === id)?.family || fonts.value[0]?.family;
const save = async () => {
  finishText(); endProperty(); if (!source.value || exporting.value || loadingFont.value || gesture) return;
  exporting.value = true;
  try {
    const items = copyObjects().filter((item) => !pristineOriginal(item));
    const ids = [...originalIds.value];
    const data = ids.length ? await ensureTextClient().remove(ids) : source.value.data;
    const output = await exportEditedPdf(data, pages.value, items, Object.fromEntries(fonts.value.map((font) => [font.id, font.bytes])), ids.length > 0);
    await saveFile(output, `${source.value.name.replace(/\.pdf$/i, "")}_${t("document.pdfEditSuffix")}.pdf`);
  } catch (error) { showError(error); }
  finally { exporting.value = false; }
};
useWindowEvent("resize", scrollPages);
useWindowEvent("keydown", (event) => {
  if (!source.value || loading.value || loadingFont.value || exporting.value || gesture || event.isComposing) return;
  const input = event.target instanceof HTMLElement && (event.target.matches("input, textarea, select") || event.target.isContentEditable);
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
  else if (!input && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  else if (!input && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
  else if (!input && (event.key === "Delete" || event.key === "Backspace")) { event.preventDefault(); remove(); }
  else if (event.key === "Escape") { finishText(); mode.value = "select"; selectedId.value = undefined; }
});
onBeforeUnmount(() => {
  disposed = true; reset();
});
</script>

<template>
  <div class="pdf-editor" @wheel="onWheel">
    <FileDropZone v-if="!source" accept=".pdf" :paste="false" :title="t('document.pdfEditDrop')" :hint="t('document.pdfEditIntro')" @files="open" />
    <p v-if="loading" class="loading"><LoaderCircle :size="16" class="spin" />{{ t("document.pdfEditOpening") }}</p>
    <template v-if="source">
      <div class="card editor-controls">
        <div class="toolbar">
          <div ref="toolStrip" class="tools" role="group" :aria-label="t('document.pdfEditTools')">
            <template v-for="(tool, index) in tools" :key="tool.id">
              <span v-if="index === 3 || index === 5" class="tool-divider" aria-hidden="true" />
              <button class="btn subtle small tool-button" :class="{ primary: mode === tool.id }" :aria-pressed="mode === tool.id" :disabled="exporting" :title="t(`document.pdfEditTool_${tool.id}`)" @click="chooseMode(tool.id)"><component :is="tool.icon" :size="17" /><span>{{ t(`document.pdfEditTool_${tool.id}`) }}</span></button>
            </template>
          </div>
          <div class="toolbar-actions">
            <div class="history-actions">
              <button class="icon-btn" :disabled="!canUndo || exporting" :title="t('document.pdfEditUndo')" @click="undo"><Undo2 :size="17" /></button>
              <button class="icon-btn" :disabled="!canRedo || exporting" :title="t('document.pdfEditRedo')" @click="redo"><Redo2 :size="17" /></button>
            </div>
            <div class="zoom-controls">
              <button class="icon-btn" :disabled="zoom <= 0.25" :title="t('document.pdfEditZoomOut')" @click="changeZoom(zoom - 0.25)"><ZoomOut :size="16" /></button><span class="zoom-value">{{ Math.round(zoom * 100) }}%</span><button class="icon-btn" :disabled="zoom >= 2" :title="t('document.pdfEditZoomIn')" @click="changeZoom(zoom + 0.25)"><ZoomIn :size="16" /></button>
            </div>
            <button class="btn small primary export-button" :disabled="exporting || loading" @click="save"><LoaderCircle v-if="exporting" :size="15" class="spin" /><Save v-else :size="15" />{{ t("document.pdfEditExport") }}</button>
            <button class="icon-btn close-button" :disabled="exporting" :title="t('document.pdfEditClose')" @click="reset"><X :size="17" /></button>
          </div>
        </div>
        <div class="format-toolbar">
          <div class="property-row">
            <div class="property-context"><component :is="propertyTool.icon" :size="16" /><span>{{ t(`document.pdfEditTool_${propertyTool.id}`) }}</span><SlidersHorizontal :size="13" class="property-mark" /></div>
            <Transition name="property-slide">
              <div v-if="showTextControls" class="property-group text-properties">
                <label class="font-property"><span>{{ t("document.pdfEditFont") }}</span><AppSelect :model-value="selected?.fontId || fontId" :options="fontOptions" :disabled="loadingFont || exporting" size="sm" @update:model-value="selectFont" /></label>
                <label><span>{{ t("document.pdfEditFontSize") }}</span><input class="field size-field" type="number" min="6" max="144" :value="selected?.fontSize || defaultSize" @focus="startProperty" @change="selected?.kind === 'text' ? update({ fontSize: Number(($event.target as HTMLInputElement).value) }) : defaultSize = Number(($event.target as HTMLInputElement).value)" @blur="endProperty" /></label>
                <button class="btn subtle small import-font" :title="t('document.pdfEditImportFont')" @click="fontInput?.click()"><Upload :size="14" />{{ t("document.pdfEditImportFontShort") }}</button>
              </div>
            </Transition>
            <div v-if="selected || mode !== 'select'" class="property-group appearance-properties">
              <label v-if="selected?.kind !== 'image'" class="color-property"><span>{{ t("document.pdfEditColor") }}</span><input class="color-input" type="color" :value="selected?.color || color" @focus="startProperty" @input="selected ? selected.color = ($event.target as HTMLInputElement).value : color = ($event.target as HTMLInputElement).value" @blur="endProperty" /></label>
              <label v-if="selected" class="opacity-property"><span>{{ t("document.pdfEditOpacity") }}</span><input type="range" min="0.05" max="1" step="0.05" v-model.number="selected.opacity" @focus="startProperty" @pointerdown="startProperty" @change="endProperty" @blur="endProperty" /><output>{{ Math.round(selected.opacity * 100) }}%</output></label>
            </div>
            <Transition name="property-slide">
              <div v-if="showStrokeControls" class="property-group stroke-properties">
                <label>{{ t("document.pdfEditStroke") }}<input class="field size-field" type="number" min="0.5" max="20" step="0.5" :value="selected?.strokeWidth ?? defaultStroke" @focus="startProperty" @input="selected ? selected.strokeWidth = Number(($event.target as HTMLInputElement).value) : defaultStroke = Number(($event.target as HTMLInputElement).value)" @change="endProperty" @blur="endProperty" /></label>
                <label v-if="selected?.kind === 'arrow'">{{ t("document.pdfEditArrowHeadSize") }}<input class="field size-field arrow-head-size" type="number" min="4" max="96" step="1" v-model.number="selected.arrowHeadSize" @focus="startProperty" @change="endProperty" @blur="endProperty" /></label>
                <label v-else-if="!selected && mode === 'arrow'">{{ t("document.pdfEditArrowHeadSize") }}<input class="field size-field arrow-head-size" type="number" min="4" max="96" step="1" v-model.number="defaultArrowHeadSize" @change="defaultArrowHeadSize = arrowHeadSize(defaultArrowHeadSize)" /></label>
              </div>
            </Transition>
            <button v-if="selected" class="btn subtle small danger delete-object" @click="remove"><Trash2 :size="14" />{{ t("document.pdfEditDelete") }}</button>
          </div>
        </div>
      </div>
      <div ref="workspace" class="workspace">
        <aside ref="navigationPanel" id="pdf-navigation" class="card thumbnails" :style="{ flexBasis: `${navigationWidth}px` }">
          <div v-if="outline.length" class="seg fill navigation-tabs">
            <button :class="{ on: navigation === 'thumbnails' }" @click="navigation = 'thumbnails'">{{ t("document.pdfEditThumbnails") }}</button>
            <button :class="{ on: navigation === 'outline' }" @click="navigation = 'outline'">{{ t("document.pdfEditOutline") }}</button>
          </div>
          <div v-if="navigation === 'outline' && outline.length" class="outline-list">
            <button v-for="entry in outline" :key="entry.id" class="outline-entry" :style="{ paddingInlineStart: `${8 + Math.min(entry.depth, 6) * 12}px` }" :title="entry.title" :disabled="!entry.destination" @click="followOutline(entry)">{{ entry.title }}</button>
          </div>
          <div v-else class="thumbnail-list">
          <button v-for="(page, index) in pages" :key="index" :ref="observeThumb" class="page-thumb" :class="{ active: index === pageIndex }" :aria-current="index === pageIndex ? 'page' : undefined" :data-page="index" :title="t('document.pdfEditPage', { n: index + 1 })" @click="goToPage(index)">
            <div :style="{ aspectRatio: `${page.width} / ${page.height}` }"><img v-if="thumbs.get(index)" :src="thumbs.get(index)" alt="" /><span v-else>{{ index + 1 }}</span></div><span>{{ index + 1 }}</span><small v-if="objects.some((item) => item.page === index)">{{ t("document.pdfEditModified") }}</small>
          </button>
          </div>
        </aside>
        <div class="navigation-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-controls="pdf-navigation" :aria-label="t('document.pdfEditNavigationResize')" :aria-valuenow="navigationWidth" :aria-valuemin="140" :aria-valuemax="navigationLimit()" @pointerdown="beginNavigationResize" @pointermove="resizeNavigation" @pointerup="endNavigationResize($event)" @pointercancel="endNavigationResize($event, true)" @keydown="resizeNavigationKey" />
        <main ref="canvasScroll" class="canvas-scroll" @scroll.passive="scrollPages">
          <div class="page-stack">
          <div v-for="(page, index) in pages" :key="index" class="page-stage" :data-document-page="index" :ref="(element) => setPageElement(element, index)" :class="{ drawing: mode !== 'select', rendering: index === pageIndex && rendering && !pageImages.has(index) }" :style="{ width: `${page.width * zoom}px`, height: `${page.height * zoom}px` }" @pointerdown.self="activatePage($event, index)" @pointermove="move" @pointerup="finish($event)" @pointercancel="finish($event, true)">
            <img v-if="pageImages.get(index)" class="page-background" :src="pageImages.get(index)" alt="" draggable="false" />
            <template v-if="index === pageIndex && ['select', 'text', 'original'].includes(mode) && !readingOriginal">
              <button v-for="run in currentOriginalText" :key="run.id" class="original-text-target" :class="{ unsupported: !run.supported }" :style="{ left: `${run.x * zoom}px`, top: `${run.y * zoom}px`, width: `${run.width * zoom}px`, height: `${run.height * zoom}px` }" :title="run.supported ? run.text : t('document.pdfEditUnsupportedOriginal')" :aria-label="run.text" @pointerdown.stop.prevent="editOriginal(run)" />
            </template>
            <div v-for="item in objects.filter((object) => object.page === index)" :key="item.id" class="edit-object" :class="{ 'text-kind': item.kind === 'text', selected: item.id === selectedId && ['select', 'text', 'original'].includes(mode) }" :style="objectStyle(item)" @pointerdown.stop="activatePage($event, index, item)" @dblclick.stop="item.kind === 'text' && editText(item)">
              <textarea v-if="item.kind === 'text' && editingId === item.id" v-model="item.text" class="inline-text" wrap="off" :class="{ 'original-pristine': originalStillVisible(item) }" :style="textStyle(item)" :placeholder="t('document.pdfEditTypeHere')" :aria-label="t('document.pdfEditText')" @input="growText(item, $event)" @pointerdown.stop @dblclick.stop @blur="blurText($event)" />
              <div v-else-if="item.kind === 'text'" class="text-object" :class="{ 'original-pristine': originalStillVisible(item) }" :style="textStyle(item)">{{ item.text }}</div>
              <img v-else-if="item.kind === 'image'" :src="item.image" alt="" draggable="false" />
              <svg v-else :viewBox="`0 0 ${item.width} ${item.height}`" preserveAspectRatio="none">
                <rect v-if="item.kind === 'highlight'" width="100%" height="100%" fill="currentColor" />
                <rect v-else-if="item.kind === 'rectangle'" :x="item.strokeWidth / 2" :y="item.strokeWidth / 2" :width="Math.max(0, item.width - item.strokeWidth)" :height="Math.max(0, item.height - item.strokeWidth)" fill="none" stroke="currentColor" :stroke-width="item.strokeWidth" />
                <ellipse v-else-if="item.kind === 'ellipse'" :cx="item.width / 2" :cy="item.height / 2" :rx="Math.max(0, (item.width - item.strokeWidth) / 2)" :ry="Math.max(0, (item.height - item.strokeWidth) / 2)" fill="none" stroke="currentColor" :stroke-width="item.strokeWidth" />
                <template v-else><polyline :points="pointsAttribute(item)" fill="none" stroke="currentColor" :stroke-width="item.strokeWidth" stroke-linecap="round" stroke-linejoin="round" /><polyline v-if="item.kind === 'arrow'" :points="arrowHead(item)" fill="none" stroke="currentColor" :stroke-width="item.strokeWidth" stroke-linecap="round" stroke-linejoin="round" /></template>
              </svg>
              <button v-if="item.kind === 'text' && item.id === selectedId && ['select', 'text', 'original'].includes(mode)" class="move-handle" :title="t('document.pdfEditMove')" :aria-label="t('document.pdfEditMove')" @pointerdown.stop="begin($event, item, false, true)"><Move :size="12" /></button>
              <button v-if="item.id === selectedId && ['select', 'text', 'original'].includes(mode)" class="resize-handle" :title="t('document.pdfEditResize')" @pointerdown.stop="begin($event, item, true)" />
            </div>
            <div v-if="index === pageIndex && (rendering && !pageUrl)" class="render-state"><LoaderCircle :size="20" class="spin" />{{ readingOriginal || removingOriginal ? t("document.pdfEditReadingOriginal") : t("document.pdfEditRendering") }}</div>
          </div>
          </div>
        </main>

      </div>
      <div class="footer"><span>{{ source.name }}</span><span>{{ t("document.pdfEditPageCount", { current: pageIndex + 1, total: pages.length, count: objects.length }) }}</span></div>
    </template>
    <input ref="imageInput" class="hidden-input" type="file" accept="image/png,image/jpeg,image/webp" @change="importImage" />
    <input ref="fontInput" class="hidden-input" type="file" accept=".ttf,.otf" @change="importFont" />
  </div>
</template>

<style scoped>
.pdf-editor { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 12px; }
.editor-controls { flex: none; gap: 0; padding: 0; overflow: visible; }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; padding: 10px 12px; align-items: center; }
.tools { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 3px; }
.tool-button.btn { position: relative; z-index: 1; height: 36px; gap: 7px; padding-inline: 11px; border-color: transparent; font-weight: 500; color: var(--text-2); transition: color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out); }
.tool-button.btn.primary { background: var(--accent-soft); border-color: transparent; color: var(--accent); }
.tools.gliding .tool-button.primary { background: transparent; }
.tools :deep(> .glide-pill) { background: var(--accent-soft); box-shadow: none; border-radius: 7px; }
.tool-divider { flex: 0 0 1px; height: 20px; margin: 0 6px; background: var(--border); }
.toolbar-actions { display: flex; align-items: center; flex-wrap: nowrap; gap: 12px; margin-left: auto; color: var(--text-2); }
.history-actions, .zoom-controls { display: flex; align-items: center; gap: 2px; }
.toolbar-actions .icon-btn { width: 30px; height: 32px; border-radius: 6px; }
.zoom-controls { padding: 1px 3px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); }
.zoom-value { min-width: 44px; text-align: center; font-size: 12px; font-variant-numeric: tabular-nums; }
.export-button.btn { height: 36px; padding-inline: 15px; gap: 7px; font-weight: 600; }
.close-button { margin-left: -5px; }
.workspace { flex: 1; min-height: 0; display: flex; gap: 12px; }
.thumbnails { flex: 0 0 auto; min-width: 140px; padding: 10px; gap: 10px; overflow: auto; }
.navigation-resizer { flex: 0 0 8px; margin-inline: -10px; border-radius: 4px; cursor: col-resize; touch-action: none; z-index: 1; }
.navigation-resizer:hover, .navigation-resizer:focus-visible { background: var(--accent-soft); outline: 1px solid var(--accent); }
.thumbnail-list { display: flex; flex-direction: column; gap: 10px; }
.navigation-tabs { position: sticky; top: 0; flex-shrink: 0; z-index: 1; }
.navigation-tabs button { min-width: 0; padding-inline: 5px; font-size: 11px; }
.outline-list { display: flex; flex-direction: column; gap: 2px; }
.outline-entry { padding: 7px 8px; border: 0; border-radius: 5px; background: transparent; color: var(--text-2); font-size: 12px; text-align: start; overflow-wrap: anywhere; }
.outline-entry:hover { background: var(--hover); color: var(--text); }
.outline-entry:disabled { cursor: default; }
.page-thumb { border: 1px solid var(--border); border-radius: 7px; padding: 6px; background: var(--surface); color: var(--text-2); font-size: 12px; }
.page-thumb.active { border-width: 3px; padding: 4px; border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.page-thumb > div { width: 100%; display: grid; place-items: center; background: var(--bg-sunken); overflow: hidden; }
.page-thumb img { width: 100%; height: 100%; object-fit: contain; }
.page-thumb small { display: block; }
.canvas-scroll { flex: 1; min-width: 0; overflow: auto; padding: 24px; background: var(--bg-sunken); border: 1px solid var(--border); border-radius: 10px; }
.page-stack { display: flex; flex-direction: column; align-items: center; gap: 24px; min-width: max-content; min-height: 100%; }
.page-stage { position: relative; flex: none; margin: 0 auto; background: var(--surface); box-shadow: var(--shadow); touch-action: none; user-select: none; }
.page-stage.drawing { cursor: crosshair; }
.page-stage.rendering { pointer-events: none; }
.page-background { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.original-text-target { position: absolute; padding: 0; border: 1px solid var(--border); background: transparent; cursor: text; }
.original-text-target:hover { border-color: var(--accent); background: var(--accent-soft); }
.original-text-target.unsupported { cursor: not-allowed; }
.edit-object { position: absolute; cursor: move; }
.edit-object.text-kind { pointer-events: none; cursor: default; }
.edit-object.selected { outline: 1px solid var(--accent); }
.edit-object > img, .edit-object > svg { display: block; width: 100%; height: 100%; pointer-events: none; }
.edit-object > img { object-fit: fill; }
/* 箭头两翼与圆头线帽可能超出线段包围框，不能被 SVG 视口裁切。 */
.edit-object > svg { overflow: visible; }
.inline-text { display: block; width: 100%; height: 100%; margin: 0; padding: 0; border: none; outline: none; resize: none; overflow: hidden; background: transparent; color: inherit; line-height: 1.25; white-space: pre; overflow-wrap: normal; cursor: text; user-select: text; pointer-events: auto; }
.inline-text, .text-object { font-kerning: none; font-variant-ligatures: none; font-feature-settings: "kern" 0, "liga" 0, "clig" 0, "calt" 0; font-synthesis: none; tab-size: 4; }
.original-pristine { color: transparent; caret-color: var(--text); }
.text-object { max-height: 100%; cursor: text; white-space: pre; overflow-wrap: normal; line-height: 1.25; overflow: hidden; pointer-events: auto; }
.move-handle { position: absolute; left: -1px; top: -21px; display: grid; place-items: center; width: 22px; height: 20px; padding: 0; border: 1px solid var(--accent); border-radius: 3px 3px 0 0; background: var(--surface); color: var(--accent); cursor: move; pointer-events: auto; }
.resize-handle { position: absolute; right: -5px; bottom: -5px; width: 10px; height: 10px; padding: 0; border: 1px solid var(--surface); background: var(--accent); cursor: nwse-resize; pointer-events: auto; }
.render-state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--surface); color: var(--text-2); }
.format-toolbar { border-top: 1px solid var(--border); background: var(--bg); border-radius: 0 0 var(--radius) var(--radius); }
.property-row { display: flex; align-items: center; flex-wrap: wrap; min-height: 58px; gap: 10px 16px; padding: 10px 16px; }
.property-context { flex: none; display: flex; align-items: center; gap: 7px; min-width: 88px; padding-right: 16px; border-right: 1px solid var(--border); color: var(--text-2); font-size: 12px; font-weight: 600; white-space: nowrap; }
.property-mark { color: var(--text-3); margin-left: auto; }
.property-group { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
.property-group + .property-group { padding-left: 16px; border-left: 1px solid var(--border); }
.format-toolbar label { display: flex; flex: none; align-items: center; gap: 8px; font-size: 12px; color: var(--text-2); white-space: nowrap; }
.format-toolbar label > span { flex-shrink: 0; }
.format-toolbar .font-property { gap: 10px; }
.font-property :deep(.app-select) { width: 208px; max-width: 260px; background: var(--surface); }
.format-toolbar .field { height: 32px; background: var(--surface); }
.format-toolbar .size-field { width: 64px; padding-inline: 8px; font-variant-numeric: tabular-nums; }
.format-toolbar .color-input { width: 32px; height: 30px; border-radius: 6px; padding: 3px; }
.opacity-property input { width: 88px; height: 4px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.opacity-property output { min-width: 32px; font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.import-font.btn { height: 30px; padding-inline: 6px; font-size: 12px; }
.delete-object { margin-left: auto; }
.property-slide-enter-active { transition: clip-path var(--dur) var(--ease-out), transform var(--dur) var(--ease-out); }
.property-slide-leave-active { position: absolute; visibility: hidden; }
.property-slide-enter-from { clip-path: inset(0 100% 0 0); transform: translateX(6px); }
.property-slide-enter-to { clip-path: inset(-4px); transform: translateX(0); }
.passive-object { position: absolute; pointer-events: none; white-space: pre; line-height: 1.25; }
.passive-object > img, .passive-object > svg { width: 100%; height: 100%; }
.color-input { width: 100%; height: 32px; padding: 3px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
.tip { line-height: 1.6; }
.loading { display: flex; align-items: center; gap: 8px; color: var(--text-2); }
.footer { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--text-3); }
.footer > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hidden-input { display: none; }
@media (max-width: 1200px) { .toolbar { gap: 8px; } .tool-button.btn { padding-inline: 8px; } .toolbar-actions { gap: 6px; } }
@media (max-width: 1000px) { .canvas-scroll { padding: 12px; } .toolbar-actions { width: 100%; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 8px; } .history-actions { margin-right: auto; } .property-row { gap: 10px 12px; } .property-group + .property-group { border-left: 0; padding-left: 0; } }
@media (max-width: 650px) { .tool-button.btn { height: 34px; padding-inline: 7px; } .tool-divider { margin-inline: 2px; } .property-context { min-width: 0; } .font-property :deep(.app-select) { width: 170px; } .property-row { padding: 10px; } .property-group { gap: 10px; } }
@media (max-width: 650px) { .workspace { flex-wrap: wrap; overflow: auto; } .thumbnails, .navigation-resizer { display: none; } .canvas-scroll { flex-basis: 100%; min-height: 400px; } .footer { flex-wrap: wrap; } }
</style>
