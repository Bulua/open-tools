<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { isTauri } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, CircleAlert, ClipboardPaste, Download, ExternalLink, Images, LoaderCircle, Play, Search, Square, X } from "lucide-vue-next";
import ProgressBar from "@/components/common/ProgressBar.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ProcessingMascot from "@/components/common/ProcessingMascot.vue";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { useStoredRef } from "@/composables/useStoredRef";
import { formatBytes } from "@/utils/format";
import { showError } from "@/utils/errorToast";
import { formatDuration } from "../media";
import { codecLabel, pickVideoQuality, type VideoCodec } from "../videoQuality";
import { createMediaPreviewCache } from "../mediaPreviewCache";
import type { SocialDownloadAdapter, SocialMediaItem } from "../socialDownload";
import { downloadBaseName, releaseSavedMedia, revealDownloadedMedia, saveDownloadedMedia, type SavedMedia } from "../downloadStorage";

const props = defineProps<{ adapter: SocialDownloadAdapter }>();
const { t, locale } = useI18n();
const desktop = isTauri();
const prefix = computed(() => props.adapter.platform === "douyin" ? "dy" : props.adapter.platform);
const platform = computed(() => props.adapter.platform);
type Item = SocialMediaItem;
interface Entry {
  item: Item;
  status: "idle" | "working" | "done" | "error";
  step: string;
  progress: number;
  message: string;
  result: string;
  files: SavedMedia[];
  controller?: AbortController;
  previews: ReturnType<typeof createMediaPreviewCache>;
}
const entries = ref<Entry[]>([]);
const quality = useStoredRef(`${props.adapter.platform}.downloadQuality`, 0);
const codec = useStoredRef<VideoCodec>(`${props.adapter.platform}.downloadCodec`, "avc");
const qualityOptions = computed(() => [
  { value: 0, label: t("video.autoQuality") },
  ...[...new Set(entries.value.flatMap((e) => (e.item.videoQualities ?? []).map((q) => Math.min(q.width, q.height))))].sort((a, b) => b - a).map((value) => ({ value, label: `${value}P` })),
]);
const codecOptions = computed(() => {
  const available = new Set(entries.value.flatMap((e) => (e.item.videoQualities ?? []).map((q) => q.codec)));
  return (["avc", "hevc", "av1"] as const).filter((value) => !available.size || available.has(value)).map((value) => ({ value, label: codecLabel(value) }));
});
watch(qualityOptions, (options) => { if (!options.some((o) => o.value === quality.value)) quality.value = 0; });
watch(codecOptions, (options) => { if (!options.some((o) => o.value === codec.value) && options[0]) codec.value = options[0].value; });
const link = ref("");
const parsing = ref(false);
const batch = ref(false);
const busy = computed(() => batch.value || entries.value.some((e) => e.status === "working"));
let disposed = false;
const viewer = ref<{ entry: Entry; index: number; failed: boolean; url: string; loading: boolean; detail: string } | null>(null);
let previewToken = 0;
let previewController: AbortController | undefined;
const closeViewer = () => {
  previewToken++;
  previewController?.abort();
  viewer.value = null;
};
const previewKey = (kind: string, urls: string[]) => `${kind}:${urls.join("\n")}`;
const previewImageUrls = (e: Entry, index: number) => {
  const img: { urls: string[]; previewUrls?: string[] } | undefined = e.item.images[index];
  return img?.previewUrls?.length ? img.previewUrls : img?.urls ?? [];
};
const loadViewer = async (e: Entry, index: number) => {
  previewController?.abort();
  const current = ++previewToken;
  const controller = new AbortController();
  previewController = controller;
  viewer.value = { entry: e, index, failed: false, url: "", loading: true, detail: t("video.loadingPreview") };
  const kind = e.item.type === "video" ? "video" : "image";
  const local = e.files.filter((f) => f.kind === kind)[kind === "video" ? 0 : index];
  if (local || !props.adapter.previewThroughHttp) {
    Object.assign(viewer.value, { url: local?.url || (kind === "video" ? selectedQuality(e)?.urls[0] || e.item.videoUrls[0] : previewImageUrls(e, index)[0]), loading: false });
    return;
  }
  // 预览优先使用较小的 H.264 流，下载仍遵循左侧所选画质和编码。
  const compatible = (e.item.videoQualities ?? []).filter((q) => q.codec === "avc");
  const urls = kind === "video" ? pickVideoQuality(compatible, 720, "avc")?.urls || selectedQuality(e)?.urls || e.item.videoUrls : previewImageUrls(e, index);
  const key = previewKey(kind, urls);
  const cached = e.previews.get(key);
  if (cached) { Object.assign(viewer.value, { url: cached, loading: false }); return; }
  try {
    // 媒体标签不能设置 Referer 等请求头，改由程序的 HTTP 通道读取，再交给播放器。
    const data = await props.adapter.download(urls, kind, (loaded, total) => {
      if (current === previewToken && viewer.value) viewer.value.detail = `${t("video.loadingPreview")} ${formatBytes(loaded)}${total ? ` / ${formatBytes(total)}` : ""}`;
    }, controller.signal);
    if (current !== previewToken || disposed) return;
    const ext = props.adapter.imageExt(data);
    const mime = kind === "video" ? "video/mp4" : `image/${ext === "jpg" ? "jpeg" : ext}`;
    Object.assign(viewer.value!, { url: e.previews.put(key, data, mime), loading: false });
    // 只预取下一张，避免一次加载整组原图拖慢当前预览。
    if (kind === "image" && index + 1 < e.item.images.length) {
      const next = previewImageUrls(e, index + 1);
      const nextKey = previewKey("image", next);
      if (!e.previews.get(nextKey)) void props.adapter.download(next, "image", undefined, controller.signal).then((bytes) => {
        if (current === previewToken && !disposed) {
          const type = props.adapter.imageExt(bytes);
          e.previews.put(nextKey, bytes, `image/${type === "jpg" ? "jpeg" : type}`);
        }
      }).catch(() => {});
    }
  } catch (err) {
    if (current === previewToken && viewer.value && !controller.signal.aborted) {
      Object.assign(viewer.value, { loading: false, failed: true });
      showError(err);
    }
  }
};
const openViewer = (e: Entry) => loadViewer(e, 0);
const clearEntries = () => {
  closeViewer();
  entries.value.forEach((e) => { releaseSavedMedia(e.files); e.previews.clear(); });
  entries.value = [];
};
const removeEntry = (e: Entry) => {
  e.controller?.abort();
  if (viewer.value?.entry === e) closeViewer();
  releaseSavedMedia(e.files);
  e.previews.clear();
  entries.value = entries.value.filter((x) => x !== e);
};
const parse = async () => {
  if (parsing.value || !link.value.trim()) return;
  const input = link.value;
  parsing.value = true;
  try {
    const result = await props.adapter.parse(input);
    if (disposed) return;
    const items = Array.isArray(result) ? result : [result];
    const previous = new Map(entries.value.map((entry) => [entry.item.id, entry]));
    const parsed = items.map((item): Entry => {
      const old = previous.get(item.id);
      if (!old) return { item, status: "idle", step: "", progress: 0, message: "", result: "", files: [], previews: markRaw(createMediaPreviewCache()) };
      // 已下载的文件继续留在原卡片上，更新远程地址后仍可以离线播放。
      if (old.status !== "working") old.item = item;
      previous.delete(item.id);
      return old;
    });
    entries.value = [...parsed, ...previous.values()];
    if (link.value === input) link.value = "";
  } catch (e) { if (!disposed) showError(e); }
  finally { parsing.value = false; }
};
const pasteAndParse = async () => {
  try { link.value = await navigator.clipboard.readText(); }
  catch (e) { showError(e); return; }
  await parse();
};
const download = async (e: Entry) => {
  if (e.status === "working" || disposed) return;
  const controller = markRaw(new AbortController());
  const signal = controller.signal;
  releaseSavedMedia(e.files);
  Object.assign(e, { status: "working", controller, step: t("video.preparing"), progress: 0, message: "", result: "", files: [] });
  const item = e.item;
  const selected = selectedQuality(e);
  const title = props.adapter.baseName(item);
  const base = downloadBaseName(title, item.id);
  const progress = (label: string, from: number, span: number) => (loaded: number, total: number) => {
    e.step = `${label} ${formatBytes(loaded)}${total ? ` / ${formatBytes(total)}` : ""}`;
    e.progress = from + (total ? Math.min(loaded / total, 1) * span : 0);
  };
  const fetch = async (urls: string[], kind: "video" | "image", onProgress?: (loaded: number, total: number) => void) => {
    if (!props.adapter.previewThroughHttp) return props.adapter.download(urls, kind, onProgress, signal);
    const cached = e.previews.get(previewKey(kind, urls));
    if (cached) return new Uint8Array(await (await globalThis.fetch(cached, { signal })).arrayBuffer());
    return props.adapter.download(urls, kind, onProgress, signal);
  };
  const save = async (name: string, data: Uint8Array, kind: SavedMedia["kind"]) => {
    if (signal.aborted) throw new Error(t("video.cancelled"));
    const file = await saveDownloadedMedia(props.adapter.platform, name, data, kind);
    if (disposed || !entries.value.includes(e)) releaseSavedMedia([file]);
    else e.files.push(file);
    if (signal.aborted) throw new Error(t("video.cancelled"));
  };
  try {
    if (item.type === "video") {
      const data = await fetch(selected?.urls ?? item.videoUrls, "video", progress(t("video.dlVideoFile"), 0, 0.97));
      await save(`${base}.mp4`, data, "video");
      const resolution = selected?.resolution ?? item.resolution;
      e.result = t("video.videoNote", { res: resolution ? ` ${resolution}` : "", size: formatBytes(data.length) });
    } else {
      let size = 0;
      for (const [i, img] of item.images.entries()) {
        if (signal.aborted) throw new Error(t("video.cancelled"));
        const name = `${base}_${String(i + 1).padStart(2, "0")}`;
        const data = await fetch(img.urls, "image", progress(t("video.dlImage", { i: i + 1, n: item.images.length }), i / item.images.length, 0.9 / item.images.length));
        const ext = props.adapter.imageExt(data);
        await save(`${name}.${ext}`, data, "image");
        size += data.length;
        // 实况照片自动同时保存动态片段，不再要求用户额外勾选。
        if (img.live.length) {
          const live = await fetch(img.live, "video", progress(t("video.dlVideoFile"), (i + 0.9) / item.images.length, 0.1 / item.images.length));
          await save(`${name}_${t("video.liveSuffix")}.mp4`, live, "video");
          size += live.length;
        }
        e.progress = (i + 1) / item.images.length;
      }
      e.result = t("video.imagesNote", { n: item.images.length, size: formatBytes(size) });
    }
    Object.assign(e, { status: "done", progress: 1 });
  } catch (err) {
    Object.assign(e, { status: "error", message: signal.aborted ? t("video.cancelled") : err instanceof Error ? err.message : String(err) });
    if (!signal.aborted && !disposed) showError(err);
  } finally { e.step = ""; e.controller = undefined; }
};
const downloadAll = async () => {
  if (busy.value) return;
  batch.value = true;
  try {
    for (const e of [...entries.value]) {
      if (disposed) break;
      if (entries.value.includes(e) && e.status !== "done") await download(e);
    }
  } finally { batch.value = false; }
};
const reveal = async (e: Entry) => {
  try { if (e.files[0]) await revealDownloadedMedia(e.files[0]); }
  catch (err) { showError(err); }
};
const date = (time: number) => time ? new Intl.DateTimeFormat(locale.value).format(new Date(time * 1000)) : "";
const shortDesc = (desc: string) => desc.replace(/#\S+/g, "").trim() || t("video.noDesc");
const selectedQuality = (e: Entry) => pickVideoQuality(e.item.videoQualities ?? [], quality.value, codec.value);
const thumbnailSource = (e: Entry) => (e.item.type === "images" ? e.files.find((f) => f.kind === "image")?.url : "") || e.item.cover || previewImageUrls(e, 0)[0];
const go = (delta: number) => {
  if (!viewer.value) return;
  const { entry, index } = viewer.value;
  void loadViewer(entry, (index + delta + entry.item.images.length) % entry.item.images.length);
};
useWindowEvent("keydown", (ev) => {
  if (!viewer.value) return;
  if (ev.key === "Escape") closeViewer();
  else if (viewer.value.entry.item.type === "images" && ev.key === "ArrowLeft") go(-1);
  else if (viewer.value.entry.item.type === "images" && ev.key === "ArrowRight") go(1);
});
onBeforeUnmount(() => {
  disposed = true;
  closeViewer();
  entries.value.forEach((e) => { e.controller?.abort(); releaseSavedMedia(e.files); e.previews.clear(); });
});
</script>

<template>
  <div class="social">
    <div class="card bar">
      <input v-model="link" class="field link" :placeholder="t(`video.${prefix}Placeholder`)" spellcheck="false" @keydown.enter="parse" />
      <button class="btn subtle" :title="t(`video.${prefix}PasteTitle`)" :disabled="parsing" @click="pasteAndParse"><ClipboardPaste :size="14" />{{ t("video.paste") }}</button>
      <button class="btn primary" :disabled="!link.trim() || parsing" @click="parse"><LoaderCircle v-if="parsing" :size="14" class="spin" /><Search v-else :size="14" />{{ parsing ? t("video.parsing") : t("video.parse") }}</button>
    </div>
    <p v-if="platform === 'douyin' && !desktop" class="tip">{{ t("video.dyDesktopOnly") }}</p>
    <p v-else-if="!desktop" class="tip">{{ t("video.xhsWebTip") }}</p>
    <div class="main">
    <aside class="card panel">
      <section class="section">
        <h3>{{ t("video.quality") }}</h3>
        <AppSelect v-model="quality" :options="qualityOptions" />
        <template v-if="platform !== 'x'">
          <h3>{{ t("video.codec") }}</h3>
          <AppSelect v-model="codec" :options="codecOptions" />
        </template>
        <p class="tip">{{ t(platform === "x" ? "video.xQualityTip" : "video.socialQualityTip") }}</p>
      </section>
    </aside>
    <section class="card list">
      <div class="card-title">
        {{ t("video.posts") }}<span v-if="entries.length" class="count">{{ t("video.countN", { n: entries.length }) }}</span>
        <div class="push actions">
          <button v-if="entries.length > 1" class="btn small subtle" :disabled="busy" @click="downloadAll"><Download :size="13" />{{ t("video.downloadAll") }}</button>
          <button v-if="entries.length" class="btn small subtle" :disabled="busy" @click="clearEntries">{{ t("video.clear") }}</button>
        </div>
      </div>
      <div class="results">
        <ProcessingMascot v-if="parsing" class="results-overlay" :title="t('video.parse')" :detail="t('video.openingPage')" />
        <div v-if="!entries.length && !parsing" class="empty"><p>{{ t(`video.${prefix}EmptyHint`) }}</p><p class="sub">{{ t(platform === "x" ? "video.xEmptySub" : "video.autoMediaEmpty") }}</p></div>
        <div v-else-if="entries.length" class="grid">
          <article v-for="e in entries" :key="e.item.id" class="video" :class="e.status">
            <div class="thumb" :title="e.item.type === 'video' ? t('video.play') : t('video.browseImages')" @click="openViewer(e)">
              <img :src="thumbnailSource(e)" alt="" referrerpolicy="no-referrer" loading="lazy" />
              <span class="play-icon"><Play v-if="e.item.type === 'video'" :size="22" /><Images v-else :size="22" /></span>
              <span class="badge left">{{ e.item.type === 'video' ? formatDuration(e.item.duration) : t("video.photoPost", { n: e.item.images.length }) }}</span>
              <button class="close" :title="t('video.remove')" @click.stop="removeEntry(e)"><X :size="13" /></button>
            </div>
            <div class="body">
              <h4 class="title" :title="e.item.desc">{{ shortDesc(e.item.desc) }}</h4>
              <p class="meta">{{ e.item.author }}<template v-if="date(e.item.createTime)"> · {{ date(e.item.createTime) }}</template></p>
              <div class="card-detail" :title="e.message || e.result">
              <p v-if="e.status === 'idle' && e.item.type === 'video'" class="meta">
                {{ t("video.availableQuality", { res: selectedQuality(e)?.resolution || e.item.resolution || t('video.qualityUnknown') }) }}<template v-if="selectedQuality(e)"> · {{ codecLabel(selectedQuality(e)!.codec) }}</template>
              </p>
              <div v-if="e.status === 'working'" class="download-progress"><ProgressBar :value="e.progress" /><p class="status">{{ e.step }} · {{ Math.round(e.progress * 100) }}%</p></div>
              <p v-else-if="e.status === 'done'" class="status ok">{{ t("video.savedResult", { result: e.result }) }}</p>
              <p v-else-if="e.status === 'error'" class="status bad"><CircleAlert :size="12" />{{ e.message }}</p>
              </div>
              <div class="foot">
                <button v-if="e.status === 'working'" class="btn small" @click="e.controller?.abort()"><Square :size="12" /><span>{{ t("video.cancel") }}</span></button>
                <button v-else class="btn small primary" @click="download(e)"><Download :size="13" /><span>{{ e.status === 'done' ? t("video.redownload") : t("video.download") }}</span></button>
                <button class="btn small subtle" @click="openViewer(e)"><Play v-if="e.item.type === 'video'" :size="13" /><Images v-else :size="13" /><span>{{ e.item.type === 'video' ? t("video.play") : t("video.browse") }}</span></button>
                <button v-if="e.status !== 'working' && e.files.some((f) => f.path)" class="btn small subtle" :title="t('video.openFolder')" @click="reveal(e)"><ExternalLink :size="13" /><span>{{ t("video.openFolder") }}</span></button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
    </div>
    <div v-if="viewer" class="mask" @click.self="closeViewer">
      <div class="viewer">
        <div class="viewer-head"><strong>{{ shortDesc(viewer.entry.item.desc) }}</strong><span v-if="viewer.entry.item.type === 'images'">{{ viewer.index + 1 }} / {{ viewer.entry.item.images.length }}</span><button class="icon-btn" :title="t('video.closeEsc')" @click="closeViewer"><X :size="16" /></button></div>
        <div class="screen">
          <span v-if="viewer.loading" class="screen-state"><LoaderCircle :size="18" class="spin" />{{ viewer.detail }}</span>
          <span v-else-if="viewer.failed" class="screen-state">{{ t("video.mediaPlayFailed") }}</span>
          <video v-else-if="viewer.entry.item.type === 'video'" :key="viewer.url" :src="viewer.url" controls autoplay @error="viewer.failed = true" />
          <template v-else><img :key="viewer.index" :src="viewer.url" alt="" referrerpolicy="no-referrer" @error="viewer.failed = true" /><button v-if="viewer.entry.item.images.length > 1" class="nav prev" :title="t('video.prevImage')" @click="go(-1)"><ChevronLeft :size="22" /></button><button v-if="viewer.entry.item.images.length > 1" class="nav next" :title="t('video.nextImage')" @click="go(1)"><ChevronRight :size="22" /></button></template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.social { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
.bar { flex-direction: row; align-items: center; gap: 8px; padding: 8px; }
.link { flex: 1; min-width: 0; font-size: 13px; }
.tip { line-height: 1.6; }
.actions { display: flex; gap: 6px; }
.list { flex: 1; min-width: 0; min-height: 0; }
.results { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.results-overlay { position: absolute; inset: 0; z-index: 2; background: color-mix(in srgb, var(--bg-sunken) 72%, transparent); pointer-events: none; }
.count { margin-left: 8px; font-weight: 400; color: var(--text-3); }
.push { margin-left: auto; }
.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 24px; text-align: center; font-size: 13px; color: var(--text-3); }
.empty p { margin: 0; }
.empty .sub { font-size: 12px; }
.grid { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); align-content: start; gap: 14px; padding: 14px; }
.video { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--surface); transition: box-shadow var(--dur-fast) var(--ease-out); }
.video:hover { box-shadow: var(--shadow); }
.video.done { border-color: color-mix(in srgb, var(--success) 40%, var(--border)); }
.video.error { border-color: color-mix(in srgb, var(--danger) 40%, var(--border)); }
.thumb { position: relative; aspect-ratio: 16 / 9; flex-shrink: 0; background: var(--bg-sunken); cursor: pointer; }
.thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.play-icon { position: absolute; inset: 0; margin: auto; width: 48px; height: 48px; display: grid; place-items: center; border-radius: 50%; background: var(--surface); color: var(--text); }
.badge { position: absolute; bottom: 6px; padding: 1px 6px; border-radius: 4px; background: var(--surface); color: var(--text); font-size: 11px; }
.badge.left { left: 6px; }
.close { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; display: grid; place-items: center; padding: 0; border: none; border-radius: 50%; background: var(--surface); color: var(--text); cursor: pointer; }
.body { display: grid; grid-template-rows: 2.9em 18px 36px 28px; gap: 4px; padding: 10px 12px 12px; font-size: 13.5px; }
.title { margin: 0; font-size: 13.5px; font-weight: 600; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-3); }
.card-detail { min-width: 0; min-height: 0; overflow: auto; }
.main { flex: 1; min-height: 0; display: flex; gap: 14px; }
.panel { flex: 0 0 280px; align-self: flex-start; max-height: 100%; overflow: auto; }
h3 { margin: 0; font-size: 12px; font-weight: 500; color: var(--text-2); }
.status { display: flex; align-items: center; gap: 4px; margin: 2px 0 0; font-size: 12px; color: var(--text-2); word-break: break-all; }
.status.ok { color: var(--success); }
.status.bad { color: var(--danger); }
.foot { display: flex; flex-wrap: nowrap; min-width: 0; gap: 4px; }
.foot .btn { flex: 0 1 auto; min-width: 0; gap: 4px; padding: 0 6px; }
.foot .btn > svg { flex-shrink: 0; }
.foot .btn > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mask { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 32px; background: var(--modal-scrim); }
.viewer { width: min(760px, 100%); height: min(620px, 100%); min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--surface); box-shadow: var(--shadow-lg); }
.viewer-head { display: flex; flex-shrink: 0; align-items: center; gap: 10px; font-size: 13px; }
.viewer-head strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.screen { position: relative; flex: 1; min-height: 0; min-width: 0; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: var(--bg-sunken); overflow: hidden; }
.screen video, .screen img { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; object-fit: contain; }
.screen-state { padding: 20px; font-size: 13px; color: var(--text-2); text-align: center; }
.download-progress { display: flex; flex-direction: column; gap: 5px; padding-top: 6px; }
.nav { position: absolute; top: 50%; display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 50%; background: var(--surface); color: var(--text); cursor: pointer; }
.prev { left: 12px; }
.next { right: 12px; }
</style>
