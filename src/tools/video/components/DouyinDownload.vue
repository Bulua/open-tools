<script setup lang="ts">
import { computed, markRaw, ref } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, CircleAlert, ClipboardPaste, Download, ExternalLink, FolderOpen, Images, LoaderCircle, Play, Search, Square, X } from "lucide-vue-next";
import ProgressBar from "@/components/common/ProgressBar.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { pickFolder, saveFile, saveIntoFolder } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { formatDuration } from "../media";
import { douyinBaseName, downloadFirst, getDouyinItem, imageExt, type DouyinItem } from "../douyin";

/**
 * 抖音下载（无水印）：粘贴分享链接解析，作品以卡片排在右侧（显示封面），每个都可以单独下载。
 * 视频下载为 MP4，图文下载全部原图（实况照片附带视频），可以同时下载背景音乐和封面。
 * 抖音的接口需要页面脚本签名，由桌面版在看不到的窗口中打开作品页读取，所以只有桌面版可用。
 */
const desktop = isTauri();

// ---------- 设置 ----------
const want = useStoredRef("douyin.want", { media: true, music: false, cover: false, live: true });
const folder = useStoredRef("douyin.folder", "");
const nothingWanted = computed(() => !want.value.media && !want.value.music && !want.value.cover);
const changeFolder = async () => {
  const picked = await pickFolder("选择保存位置");
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
const link = ref("");
const parsing = ref(false);
const parseError = ref("");

const parse = async () => {
  if (parsing.value || !link.value.trim()) return;
  parsing.value = true;
  parseError.value = "";
  try {
    const item = await getDouyinItem(link.value);
    const entry: Entry = { key: item.id, item, status: "idle", step: "", progress: 0, message: "", result: "" };
    const old = entries.value.find((e) => e.key === entry.key);
    entries.value = [old?.status === "working" ? old : entry, ...entries.value.filter((e) => e.key !== entry.key)];
    link.value = "";
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : String(e);
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
  Object.assign(e, { status: "working", step: "准备下载", progress: 0, message: "", result: "", controller: markRaw(controller) });
  const notes: string[] = [];
  const progress = (label: string, from: number, span: number) => (loaded: number, total: number) => {
    e.step = `${label} ${formatBytes(loaded)}${total ? ` / ${formatBytes(total)}` : ""}`;
    e.progress = from + (total ? (loaded / total) * span : 0);
  };
  try {
    if (want.value.media && item.type === "video") {
      const { data } = await downloadFirst(item.videoUrls, progress("下载视频", 0, 0.9), signal);
      await save(`${base}.mp4`, data);
      notes.push(`视频${item.resolution ? ` ${item.resolution}` : ""} · ${formatBytes(data.length)}`);
    }
    if (want.value.media && item.type === "images") {
      const n = item.images.length;
      let size = 0;
      for (const [i, img] of item.images.entries()) {
        if (signal.aborted) throw new Error("已取消");
        const name = `${base}_${String(i + 1).padStart(2, "0")}`;
        const { data } = await downloadFirst(img.urls, progress(`下载第 ${i + 1} / ${n} 张`, (i / n) * 0.9, 0.9 / n), signal);
        await save(`${name}.${imageExt(data)}`, data);
        size += data.length;
        // 实况照片：附带的短视频
        if (want.value.live && img.live.length) {
          const live = await downloadFirst(img.live, undefined, signal).catch(() => null);
          if (live) {
            await save(`${name}_实况.mp4`, live.data);
            size += live.data.length;
          }
        }
      }
      notes.push(`${n} 张图片 · ${formatBytes(size)}`);
    }
    if (want.value.music && item.music.urls.length) {
      e.step = "下载背景音乐";
      const { data, url } = await downloadFirst(item.music.urls, undefined, signal);
      const ext = url.match(/\.(mp3|m4a|aac)(?:\?|$)/i)?.[1] ?? "mp3";
      await save(`${base}_音乐${item.music.title ? `_${item.music.title.slice(0, 30)}` : ""}.${ext}`.replace(/[\\/:*?"<>|]/g, "_"), data);
      notes.push("背景音乐");
    }
    if (want.value.cover && item.cover) {
      e.step = "下载封面";
      const { data } = await downloadFirst([item.cover], undefined, signal);
      await save(`${base}_封面.${imageExt(data)}`, data);
      notes.push("封面");
    }
    Object.assign(e, { status: "done", progress: 1, result: notes.join("，") || "没有需要下载的内容" });
  } catch (err) {
    Object.assign(e, { status: "error", message: signal.aborted ? "已取消" : err instanceof Error ? err.message : String(err) });
  } finally {
    e.step = "";
    e.controller = undefined;
  }
};
const cancel = (e: Entry) => e.controller?.abort();
const downloadAll = () => entries.value.filter((e) => e.status !== "working").forEach((e) => download(e));
const date = (t: number) => (t ? new Date(t * 1000).toLocaleDateString() : "");
const shortDesc = (d: string) => d.replace(/#\S+/g, "").trim() || "（没有描述）";

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
      <input v-model="link" class="field link" placeholder="粘贴抖音分享文案或链接（v.douyin.com/…），回车解析；可以连续解析多个" spellcheck="false" @keydown.enter="parse" />
      <button class="btn subtle" title="粘贴剪贴板中的分享链接并解析" :disabled="parsing" @click="pasteAndParse"><ClipboardPaste :size="14" />粘贴</button>
      <button class="btn primary" :disabled="!link.trim() || parsing" @click="parse">
        <LoaderCircle v-if="parsing" :size="14" class="spin" />
        <Search v-else :size="14" />{{ parsing ? "解析中…" : "解析" }}
      </button>
    </div>
    <p v-if="!desktop" class="banner warn">抖音需要在程序内打开作品页读取信息，只有桌面版支持。</p>
    <p v-if="parseError" class="banner error">{{ parseError }}</p>

    <div class="main">
      <aside class="card panel">
        <section class="section">
          <h3>下载内容</h3>
          <div class="wants">
            <label class="check"><input v-model="want.media" type="checkbox" />视频 / 图片（无水印）</label>
            <label class="check" :class="{ disabled: !want.media }"><input v-model="want.live" type="checkbox" :disabled="!want.media" />实况照片附带的视频</label>
            <label class="check"><input v-model="want.music" type="checkbox" />背景音乐</label>
            <label class="check"><input v-model="want.cover" type="checkbox" />封面</label>
          </div>
          <p class="tip">视频是抖音提供的无水印原片，图文是无水印原图，画质不会损失。</p>
        </section>

        <section v-if="desktop" class="section">
          <h3>保存位置</h3>
          <p class="path" :title="folder">{{ folder || "第一次下载时选择" }}</p>
          <div class="row-btns">
            <button class="btn small subtle" @click="changeFolder"><FolderOpen :size="13" />{{ folder ? "更改" : "选择" }}</button>
            <button v-if="folder" class="btn small subtle" @click="revealFolder(folder)"><ExternalLink :size="13" />打开</button>
          </div>
        </section>

        <section class="section">
          <h3>说明</h3>
          <p class="tip">
            解析时程序会在后台打开一次作品页面（看不到窗口），需要几秒钟。偶尔遇到抖音安全验证时，稍等一会儿再试。仅供个人保存使用，请尊重作者的版权，不要去掉水印后再发布他人的作品。
          </p>
        </section>
      </aside>

      <section class="card list">
        <div class="card-title">
          作品<span v-if="entries.length" class="count">{{ entries.length }} 个</span>
          <div class="push actions">
            <button v-if="entries.length > 1" class="btn small subtle" :disabled="nothingWanted" @click="downloadAll"><Download :size="13" />全部下载</button>
            <button v-if="entries.length" class="btn small subtle" :disabled="entries.some((e) => e.status === 'working')" @click="entries = []">清空</button>
          </div>
        </div>

        <div v-if="!entries.length" class="empty">
          <p v-if="parsing"><LoaderCircle :size="16" class="spin" /> 正在打开作品页读取信息…</p>
          <template v-else>
            <p>在抖音里点「分享」→「复制链接」，粘贴到上方后回车</p>
            <p class="sub">支持视频和图文作品；解析过的作品会排在这里，可以预览、逐个下载。</p>
          </template>
        </div>

        <div v-else class="grid">
          <article v-for="e in entries" :key="e.key" class="video" :class="e.status">
            <div class="thumb" :title="e.item.type === 'video' ? '播放' : '浏览图片'" @click="openViewer(e)">
              <img :src="e.item.cover || e.item.images[0]?.urls[0]" alt="" referrerpolicy="no-referrer" loading="lazy" />
              <span class="play-icon"><Play v-if="e.item.type === 'video'" :size="22" /><Images v-else :size="22" /></span>
              <span v-if="e.item.type === 'video'" class="badge left">{{ formatDuration(e.item.duration) }}</span>
              <span v-else class="badge left">图文 · {{ e.item.images.length }} 张</span>
              <button class="close" title="移除" @click.stop="removeEntry(e)"><X :size="13" /></button>
              <ProgressBar v-if="e.status === 'working'" class="cover-progress" :value="e.progress" />
            </div>
            <div class="body">
              <h4 class="title" :title="e.item.desc">{{ shortDesc(e.item.desc) }}</h4>
              <p class="meta">{{ e.item.author }}<template v-if="date(e.item.createTime)"> · {{ date(e.item.createTime) }}</template></p>
              <p v-if="e.item.type === 'video' && e.item.resolution" class="meta">无水印 · {{ e.item.resolution }}</p>
              <p v-if="e.status === 'working'" class="status">{{ e.step }}</p>
              <p v-else-if="e.status === 'done'" class="status ok">已保存：{{ e.result }}</p>
              <p v-else-if="e.status === 'error'" class="status bad"><CircleAlert :size="12" /> {{ e.message }}</p>
              <div class="foot">
                <button v-if="e.status === 'working'" class="btn small" @click="cancel(e)"><Square :size="12" />取消</button>
                <button v-else class="btn small primary" :disabled="nothingWanted" @click="download(e)">
                  <Download :size="13" />{{ e.status === "done" ? "重新下载" : "下载" }}
                </button>
                <button class="btn small subtle" @click="openViewer(e)">
                  <template v-if="e.item.type === 'video'"><Play :size="13" />播放</template>
                  <template v-else><Images :size="13" />浏览</template>
                </button>
                <button v-if="e.status === 'done' && desktop && folder" class="btn small subtle" @click="revealFolder(folder)"><ExternalLink :size="13" />打开文件夹</button>
              </div>
            </div>
          </article>
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
            <button class="icon-btn" title="关闭（Esc）" @click="viewer = null"><X :size="16" /></button>
          </div>
          <div class="screen">
            <template v-if="viewer.entry.item.type === 'video'">
              <video v-if="!viewer.failed" :src="viewer.entry.item.videoUrls[0]" controls autoplay @error="viewer.failed = true" />
              <span v-else class="screen-state">无法在线播放（抖音拒绝了播放请求），下载后可以正常观看</span>
            </template>
            <template v-else>
              <img :key="viewer.index" :src="viewer.entry.item.images[viewer.index].urls[0]" alt="" referrerpolicy="no-referrer" />
              <button class="nav prev" title="上一张（←）" @click="go(-1)"><ChevronLeft :size="22" /></button>
              <button class="nav next" title="下一张（→）" @click="go(1)"><ChevronRight :size="22" /></button>
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
.banner.error {
  background: var(--danger-soft);
  color: var(--danger);
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
