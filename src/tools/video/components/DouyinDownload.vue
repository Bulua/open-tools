<script setup lang="ts">
import { computed, markRaw, ref } from "vue";
import { useI18n } from "vue-i18n";
import { isTauri } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, CircleAlert, ClipboardPaste, Download, ExternalLink, FolderOpen, Images, LoaderCircle, Play, Search, Square, X } from "lucide-vue-next";
import ProgressBar from "@/components/common/ProgressBar.vue";
import ProcessingMascot from "@/components/common/ProcessingMascot.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { pickFolder, saveFile, saveIntoFolder } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { showError } from "@/utils/errorToast";
import { formatDuration } from "../media";
import { douyinBaseName, downloadFirst, getDouyinItem, imageExt, type DouyinItem } from "../douyin";

/**
 * 抖音下载（无水印）：粘贴分享链接解析，作品以卡片排在右侧（显示封面），每个都可以单独下载。
 * 视频下载为 MP4，图文下载全部原图（实况照片附带视频），可以同时下载背景音乐和封面。
 * 抖音的接口需要页面脚本签名，由桌面版在看不到的窗口中打开作品页读取，所以只有桌面版可用。
 */
const { t } = useI18n();
const desktop = isTauri();

// ---------- 设置 ----------
const want = useStoredRef("douyin.want", { media: true, music: false, cover: false, live: true });
const folder = useStoredRef("douyin.folder", "");
const nothingWanted = computed(() => !want.value.media && !want.value.music && !want.value.cover);
const changeFolder = async () => {
  const picked = await pickFolder(t("video.chooseFolder"));
  if (picked) folder.value = picked;
  return picked;
};
const revealFolder = async (path: string) => {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  revealItemInDir(path).catch(() => {});
};

// ---------- 解析过的作品 ----------
interface Entry {
  key: string;
  item: DouyinItem;
  status: "idle" | "working" | "done" | "error";
  step: string;
  progress: number;
  message: string;
  result: string;
  controller?: AbortController;
}
const entries = ref<Entry[]>([]);
const activeDownload = computed(() => entries.value.find((e) => e.status === "working"));
const link = ref("");
const parsing = ref(false);

const parse = async () => {
  if (parsing.value || !link.value.trim()) return;
  parsing.value = true;
  try {
    const item = await getDouyinItem(link.value);
    const entry: Entry = { key: item.id, item, status: "idle", step: "", progress: 0, message: "", result: "" };
    const old = entries.value.find((e) => e.key === entry.key);
    entries.value = [old?.status === "working" ? old : entry, ...entries.value.filter((e) => e.key !== entry.key)];
    link.value = "";
  } catch (e) {
    showError(e);
  } finally {
    parsing.value = false;
  }
};
const pasteAndParse = async () => {
  try {
    link.value = await navigator.clipboard.readText();
  } catch {
    return;
  }
  parse();
};
const removeEntry = (e: Entry) => {
  e.controller?.abort();
  entries.value = entries.value.filter((x) => x !== e);
};

// ---------- 下载 ----------
const download = async (e: Entry) => {
  if (e.status === "working" || nothingWanted.value) return;
  let dir = "";
  if (desktop) {
    dir = folder.value || (await changeFolder()) || "";
    if (!dir) return;
  }
  const save = (name: string, data: Uint8Array) => (dir ? saveIntoFolder(dir, name, data) : saveFile(data, name).then(() => {}));
  const item = e.item;
  const base = douyinBaseName(item);
  const controller = new AbortController();
  const signal = controller.signal;
  // AbortController 不能被响应式代理包装（调用 abort 会出错），用 markRaw 原样保存
  Object.assign(e, { status: "working", step: t("video.preparing"), progress: 0, message: "", result: "", controller: markRaw(controller) });
  const notes: string[] = [];
  const progress = (label: string, from: number, span: number) => (loaded: number, total: number) => {
    e.step = `${label} ${formatBytes(loaded)}${total ? ` / ${formatBytes(total)}` : ""}`;
    e.progress = from + (total ? (loaded / total) * span : 0);
  };
  try {
    if (want.value.media && item.type === "video") {
      const { data } = await downloadFirst(item.videoUrls, progress(t("video.dlVideoFile"), 0, 0.9), signal);
      await save(`${base}.mp4`, data);
      notes.push(t("video.videoNote", { res: item.resolution ? ` ${item.resolution}` : "", size: formatBytes(data.length) }));
    }
    if (want.value.media && item.type === "images") {
      const n = item.images.length;
      let size = 0;
      for (const [i, img] of item.images.entries()) {
        if (signal.aborted) throw new Error(t("video.cancelled"));
        const name = `${base}_${String(i + 1).padStart(2, "0")}`;
        const { data } = await downloadFirst(img.urls, progress(t("video.dlImage", { i: i + 1, n }), (i / n) * 0.9, 0.9 / n), signal);
        await save(`${name}.${imageExt(data)}`, data);
        size += data.length;
        // 实况照片：附带的短视频
        if (want.value.live && img.live.length) {
          const live = await downloadFirst(img.live, undefined, signal).catch(() => null);
          if (live) {
            await save(`${name}_${t("video.liveSuffix")}.mp4`, live.data);
            size += live.data.length;
          }
        }
      }
      notes.push(t("video.imagesNote", { n, size: formatBytes(size) }));
    }
    if (want.value.music && item.music.urls.length) {
      e.step = t("video.dlMusic");
      const { data, url } = await downloadFirst(item.music.urls, undefined, signal);
      const ext = url.match(/\.(mp3|m4a|aac)(?:\?|$)/i)?.[1] ?? "mp3";
      await save(`${base}_${t("video.musicSuffix")}${item.music.title ? `_${item.music.title.slice(0, 30)}` : ""}.${ext}`.replace(/[\\/:*?"<>|]/g, "_"), data);
      notes.push(t("video.music"));
    }
    if (want.value.cover && item.cover) {
      e.step = t("video.dlCover");
      const { data } = await downloadFirst([item.cover], undefined, signal);
      await save(`${base}_${t("video.coverSuffix")}.${imageExt(data)}`, data);
      notes.push(t("video.cover"));
    }
    Object.assign(e, { status: "done", progress: 1, result: notes.join(t("video.sep")) || t("video.nothingToDownload") });
  } catch (err) {
    Object.assign(e, { status: "error", message: signal.aborted ? t("video.cancelled") : err instanceof Error ? err.message : String(err) });
  } finally {
    e.step = "";
    e.controller = undefined;
  }
};
const cancel = (e: Entry) => e.controller?.abort();
const downloadAll = () => entries.value.filter((e) => e.status !== "working").forEach((e) => download(e));
const date = (t: number) => (t ? new Date(t * 1000).toLocaleDateString() : "");
const shortDesc = (d: string) => d.replace(/#\S+/g, "").trim() || t("video.noDesc");

// ---------- 预览：视频播放、图片逐张浏览 ----------
const viewer = ref<{ entry: Entry; index: number; failed: boolean } | null>(null);
const openViewer = (e: Entry) => (viewer.value = { entry: e, index: 0, failed: false });
const go = (delta: number) => {
  const v = viewer.value;
  if (!v) return;
  const n = v.entry.item.images.length;
  v.index = (v.index + delta + n) % n;
};
useWindowEvent("keydown", (ev) => {
  if (!viewer.value) return;
  if (ev.key === "Escape") viewer.value = null;
  else if (ev.key === "ArrowLeft") go(-1);
  else if (ev.key === "ArrowRight") go(1);
});
</script>

<template>
  <div class="dy">
    <div class="card bar">
      <input v-model="link" class="field link" :placeholder="t('video.dyPlaceholder')" spellcheck="false" @keydown.enter="parse" />
      <button class="btn subtle" :title="t('video.dyPasteTitle')" :disabled="parsing" @click="pasteAndParse"><ClipboardPaste :size="14" />{{ t("video.paste") }}</button>
      <button class="btn primary" :disabled="!link.trim() || parsing" @click="parse">
        <LoaderCircle v-if="parsing" :size="14" class="spin" />
        <Search v-else :size="14" />{{ parsing ? t("video.parsing") : t("video.parse") }}
      </button>
    </div>
    <p v-if="!desktop" class="banner warn">{{ t("video.dyDesktopOnly") }}</p>

    <div class="main">
      <aside class="card panel">
        <section class="section">
          <h3>{{ t("video.content") }}</h3>
          <div class="wants">
            <label class="check"><input v-model="want.media" type="checkbox" />{{ t("video.wantMedia") }}</label>
            <label class="check" :class="{ disabled: !want.media }"><input v-model="want.live" type="checkbox" :disabled="!want.media" />{{ t("video.wantLive") }}</label>
            <label class="check"><input v-model="want.music" type="checkbox" />{{ t("video.wantMusic") }}</label>
            <label class="check"><input v-model="want.cover" type="checkbox" />{{ t("video.wantDyCover") }}</label>
          </div>
          <p class="tip">{{ t("video.dyTip") }}</p>
        </section>

        <section v-if="desktop" class="section">
          <h3>{{ t("video.saveTo") }}</h3>
          <p class="path" :title="folder">{{ folder || t("video.firstTime") }}</p>
          <div class="row-btns">
            <button class="btn small subtle" @click="changeFolder"><FolderOpen :size="13" />{{ folder ? t("video.change") : t("video.choose") }}</button>
            <button v-if="folder" class="btn small subtle" @click="revealFolder(folder)"><ExternalLink :size="13" />{{ t("video.open") }}</button>
          </div>
        </section>

        <section class="section">
          <h3>{{ t("video.about") }}</h3>
          <p class="tip">
            {{ t("video.dyAbout") }}
          </p>
        </section>
      </aside>

      <section class="card list">
        <div class="card-title">
          {{ t("video.posts") }}<span v-if="entries.length" class="count">{{ t("video.countN", { n: entries.length }) }}</span>
          <div class="push actions">
            <button v-if="entries.length > 1" class="btn small subtle" :disabled="nothingWanted" @click="downloadAll"><Download :size="13" />{{ t("video.downloadAll") }}</button>
            <button v-if="entries.length" class="btn small subtle" :disabled="entries.some((e) => e.status === 'working')" @click="entries = []">{{ t("video.clear") }}</button>
          </div>
        </div>

        <div class="results">
          <ProcessingMascot
            v-if="activeDownload || parsing"
            class="results-overlay"
            :title="activeDownload ? shortDesc(activeDownload.item.desc) : t('video.parse')"
            :detail="activeDownload?.step || (parsing ? t('video.openingPage') : t('video.preparing'))"
          />

          <div v-if="!entries.length && !parsing" class="empty">
            <p>{{ t("video.dyEmptyHint") }}</p>
            <p class="sub">{{ t("video.dyEmptySub") }}</p>
          </div>

          <div v-else-if="entries.length" class="grid">
            <article v-for="e in entries" :key="e.key" class="video" :class="e.status">
              <div class="thumb" :title="e.item.type === 'video' ? t('video.play') : t('video.browseImages')" @click="openViewer(e)">
                <img :src="e.item.cover || e.item.images[0]?.urls[0]" alt="" referrerpolicy="no-referrer" loading="lazy" />
                <span class="play-icon"><Play v-if="e.item.type === 'video'" :size="22" /><Images v-else :size="22" /></span>
                <span v-if="e.item.type === 'video'" class="badge left">{{ formatDuration(e.item.duration) }}</span>
                <span v-else class="badge left">{{ t("video.photoPost", { n: e.item.images.length }) }}</span>
                <button class="close" :title="t('video.remove')" @click.stop="removeEntry(e)"><X :size="13" /></button>
                <ProgressBar v-if="e.status === 'working'" class="cover-progress" :value="e.progress" />
              </div>
              <div class="body">
                <h4 class="title" :title="e.item.desc">{{ shortDesc(e.item.desc) }}</h4>
                <p class="meta">{{ e.item.author }}<template v-if="date(e.item.createTime)"> · {{ date(e.item.createTime) }}</template></p>
                <p v-if="e.item.type === 'video' && e.item.resolution" class="meta">{{ t("video.noWatermark", { res: e.item.resolution }) }}</p>
                <p v-if="e.status === 'working'" class="status">{{ e.step }}</p>
                <p v-else-if="e.status === 'done'" class="status ok">{{ t("video.savedResult", { result: e.result }) }}</p>
                <p v-else-if="e.status === 'error'" class="status bad"><CircleAlert :size="12" /> {{ e.message }}</p>
                <div class="foot">
                  <button v-if="e.status === 'working'" class="btn small" @click="cancel(e)"><Square :size="12" />{{ t("video.cancel") }}</button>
                  <button v-else class="btn small primary" :disabled="nothingWanted" @click="download(e)">
                    <Download :size="13" />{{ e.status === "done" ? t("video.redownload") : t("video.download") }}
                  </button>
                  <button class="btn small subtle" @click="openViewer(e)">
                    <template v-if="e.item.type === 'video'"><Play :size="13" />{{ t("video.play") }}</template>
                    <template v-else><Images :size="13" />{{ t("video.browse") }}</template>
                  </button>
                  <button v-if="e.status === 'done' && desktop && folder" class="btn small subtle" @click="revealFolder(folder)"><ExternalLink :size="13" />{{ t("video.openFolder") }}</button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <!-- 预览 -->
    <Transition name="modal">
      <div v-if="viewer" class="mask" @click.self="viewer = null">
        <div class="viewer">
          <div class="viewer-head">
            <strong :title="viewer.entry.item.desc">{{ shortDesc(viewer.entry.item.desc) }}</strong>
            <span v-if="viewer.entry.item.type === 'images'" class="counter">{{ viewer.index + 1 }} / {{ viewer.entry.item.images.length }}</span>
            <button class="icon-btn" :title="t('video.closeEsc')" @click="viewer = null"><X :size="16" /></button>
          </div>
          <div class="screen">
            <template v-if="viewer.entry.item.type === 'video'">
              <video v-if="!viewer.failed" :src="viewer.entry.item.videoUrls[0]" controls autoplay @error="viewer.failed = true" />
              <span v-else class="screen-state">{{ t("video.cantPlay") }}</span>
            </template>
            <template v-else>
              <img :key="viewer.index" :src="viewer.entry.item.images[viewer.index].urls[0]" alt="" referrerpolicy="no-referrer" />
              <button class="nav prev" :title="t('video.prevImage')" @click="go(-1)"><ChevronLeft :size="22" /></button>
              <button class="nav next" :title="t('video.nextImage')" @click="go(1)"><ChevronRight :size="22" /></button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dy {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bar {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px;
}
.link {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.banner {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
}
.banner.warn {
  background: var(--warning-soft);
  color: var(--warning);
}
.main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 280px;
  align-self: flex-start;
  max-height: 100%;
  overflow: auto;
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.wants {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.check.disabled {
  opacity: 0.5;
}
.tip {
  line-height: 1.6;
}
.path {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
  word-break: break-all;
}
.row-btns {
  display: flex;
  gap: 6px;
}
.list {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.results {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.results-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: color-mix(in srgb, var(--bg-sunken) 72%, transparent);
  pointer-events: none;
}
.count {
  margin-left: 8px;
  font-weight: 400;
  color: var(--text-3);
}
.push {
  margin-left: auto;
}
.actions {
  display: flex;
  gap: 6px;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}
.empty p {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.empty .sub {
  font-size: 12px;
}
.grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  align-content: start;
  gap: 14px;
  padding: 14px;
}
.video {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface);
  transition: box-shadow 0.15s;
}
.video:hover {
  box-shadow: var(--shadow);
}
.video.done {
  border-color: color-mix(in srgb, var(--success) 40%, var(--border));
}
.video.error {
  border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
}
/* 抖音多是竖屏：封面用 3:4 */
.thumb {
  position: relative;
  aspect-ratio: 3 / 4;
  background: var(--bg-sunken);
  cursor: pointer;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.play-icon {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
}
.thumb:hover .play-icon {
  opacity: 1;
}
.badge {
  position: absolute;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
}
.badge.left {
  left: 6px;
}
.close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
}
.video:hover .close {
  opacity: 1;
}
/* 盖在封面底部 */
.cover-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 0;
  background: rgba(0, 0, 0, 0.3);
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px 12px;
}
.title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.status {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-2);
  word-break: break-all;
}
.status.ok {
  color: var(--success);
}
.status.bad {
  color: var(--danger);
}
.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
}
/* 预览 */
.mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 32px;
  background: rgba(0, 0, 0, 0.6);
}
.viewer {
  width: min(900px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.viewer-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.viewer-head strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.counter {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.screen {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #000;
  overflow: hidden;
}
.screen video,
.screen img {
  max-width: 100%;
  max-height: 100%;
}
.screen-state {
  padding: 20px;
  font-size: 13px;
  color: #ccc;
  text-align: center;
}
.nav {
  position: absolute;
  top: 50%;
  width: 40px;
  height: 40px;
  margin-top: -20px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
.nav:hover {
  background: rgba(255, 255, 255, 0.3);
}
.prev {
  left: 12px;
}
.next {
  right: 12px;
}
</style>
