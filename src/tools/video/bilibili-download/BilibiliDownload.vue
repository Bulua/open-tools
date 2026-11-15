<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { isTauri } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  ClipboardPaste,
  Download,
  ExternalLink,
  LoaderCircle,
  Play,
  SkipBack,
  SkipForward,
  Search,
  Square,
  UserRound,
  X,
} from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import ProcessingMascot from "@/components/common/ProcessingMascot.vue";
import ProgressBar from "@/components/common/ProgressBar.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { downloadBaseName, releaseSavedMedia, revealDownloadedMedia, saveDownloadedMedia, type SavedMedia } from "../shared/downloadStorage";
import { formatBytes } from "@/utils/format";
import { sendMode } from "@/tools/network/shared/transport";
import { showError } from "@/utils/errorToast";
import { isAndroidApp } from "@/utils/platform";
import { formatDuration } from "../shared/media";
import {
  CODEC_PREFERENCES,
  QUALITY_NAMES,
  codecLabel,
  qualityName,
  downloadStream,
  getLoginInfo,
  getPlayInfo,
  getPreviewUrl,
  getVideoInfo,
  muxToMp4,
  outputBaseName,
  pickAudio,
  pickVideo,
  type CodecPreference,
  type LoginInfo,
  type Session,
  type VideoInfo,
  type VideoPage,
} from "./bilibili";

/**
 * B 站视频下载：粘贴视频链接解析，解析过的视频以卡片形式排在右侧（显示封面），每个都可以单独下载。
 * 自动下载视频，清晰度、编码和登录保留在左侧；保存位置由统一数据目录决定。
 * 多 P 视频在卡片里展开勾选要下载的分 P。画面和声音下载后直接合并为 MP4，不重新编码。
 * 点封面优先播放下载好的本地文件；尚未下载时在线播放，多 P 可以切换。
 */
const mode = sendMode();
const desktop = isTauri() && !isAndroidApp();

// ---------- 登录（可选） ----------
const sessdata = useStoredRef("bilibili.sessdata", "");
const session = computed<Session>(() => ({ sessdata: sessdata.value }));
const login = ref<LoginInfo | null>(null);
const checkingLogin = ref(false);
const showLogin = ref(true);
let loginTimer: ReturnType<typeof setTimeout> | undefined;
const checkLogin = async () => {
  if (mode === "browser") return;
  checkingLogin.value = true;
  try {
    login.value = await getLoginInfo(session.value);
  } catch {
    login.value = null;
  } finally {
    checkingLogin.value = false;
  }
};
watch(sessdata, () => {
  clearTimeout(loginTimer);
  loginTimer = setTimeout(checkLogin, 600);
});
onMounted(checkLogin);

// ---------- 下载设置 ----------
const quality = useStoredRef("bilibili.downloadQuality", 0);
const { t, locale } = useI18n();
const codec = useStoredRef<CodecPreference>("bilibili.codec", "avc");
const CODECS = computed(() => CODEC_PREFERENCES.map((value) => ({ value, label: codecLabel(value) })));

// ---------- 解析过的视频 ----------
interface Part extends VideoPage {
  status: "idle" | "working" | "done" | "error";
  message: string;
  files: SavedMedia[];
}
interface Entry {
  key: string;
  info: VideoInfo;
  /** 当前账号能下载的清晰度（从高到低） */
  qualities: { id: number; label: string }[];
  parts: Part[];
  /** 勾选要下载的分 P（cid） */
  selected: number[];
  expanded: boolean;
  status: "idle" | "working" | "done" | "error";
  step: string;
  progress: number;
  message: string;
  /** 下载结果，例如「1080P · H.264 · 120 MB」 */
  result: string;
  controller?: AbortController;
}
const entries = ref<Entry[]>([]);
const batch = ref(false);
const busy = computed(() => batch.value || entries.value.some((e) => e.status === "working"));
let disposed = false;
const releaseEntry = (e: Entry) => e.parts.forEach((p) => releaseSavedMedia(p.files));
const savedFile = (e: Entry) => e.parts.flatMap((p) => p.files).find((f) => f.path);
const reveal = async (e: Entry) => {
  try { const file = savedFile(e); if (file) await revealDownloadedMedia(file); }
  catch (err) { showError(err); }
};
const clearEntries = () => {
  closePlayer();
  entries.value.forEach(releaseEntry);
  entries.value = [];
};

const qualityOptions = computed(() => {
  // 清晰度选项：所有解析过的视频里出现过的；还没有解析时列出全部
  const ids = new Set(entries.value.flatMap((e) => e.qualities.map((q) => q.id)));
  const list = ids.size ? [...ids] : Object.keys(QUALITY_NAMES).map(Number);
  return [{ value: 0, label: t("video.autoQuality") }, ...list.sort((a, b) => b - a).map((id) => ({ value: id, label: qualityName(id) }))];
});
/** 这个视频实际会下载的清晰度：所选的拿不到时用能拿到的最高一档 */
const actualQuality = (e: Entry) => e.qualities.find((q) => !quality.value || q.id <= quality.value) ?? e.qualities[e.qualities.length - 1];

const link = ref("");
const parsing = ref(false);
const parse = async () => {
  if (parsing.value || !link.value.trim()) return;
  parsing.value = true;
  try {
    const { info, page } = await getVideoInfo(link.value, session.value);
    // 用第一 P 查询当前账号能下载的清晰度
    const play = await getPlayInfo(info.bvid, info.pages[0].cid, session.value).catch(() => null);
    const target = page ? info.pages.find((p) => p.page === page) : null;
    if (disposed) return;
    const entry: Entry = {
      key: info.bvid,
      info,
      qualities: play?.qualities ?? [],
      parts: info.pages.map((p) => ({ ...p, status: "idle", message: "", files: [] })),
      // 链接里指定了分 P 时只勾选这一 P，否则全选
      selected: target ? [target.cid] : info.pages.map((p) => p.cid),
      expanded: !!target && info.pages.length > 1,
      status: "idle",
      step: "",
      progress: 0,
      message: "",
      result: "",
    };
    // 同一个视频再次解析时移到最前面
    const old = entries.value.find((e) => e.key === entry.key);
    if (old && old.status !== "working") {
      for (const part of entry.parts) part.files = old.parts.find((p) => p.cid === part.cid)?.files ?? [];
      entry.status = old.status;
      entry.result = old.result;
    }
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
  if (player.value?.entry === e) closePlayer();
  releaseEntry(e);
  entries.value = entries.value.filter((x) => x !== e);
};

// 分 P 勾选
const togglePart = (e: Entry, p: Part) => (e.selected = e.selected.includes(p.cid) ? e.selected.filter((c) => c !== p.cid) : [...e.selected, p.cid]);
const toggleAllParts = (e: Entry) => (e.selected = e.selected.length === e.parts.length ? [] : e.parts.map((p) => p.cid));

// ---------- 下载 ----------
const download = async (e: Entry) => {
  if (e.status === "working" || !e.selected.length || disposed) return;
  const parts = e.parts.filter((p) => e.selected.includes(p.cid));
  const controller = markRaw(new AbortController());
  const signal = controller.signal;
  const selectedQuality = quality.value || 127;
  const selectedCodec = codec.value;
  Object.assign(e, { status: "working", step: t("video.preparing"), progress: 0, message: "", result: "", controller });
  parts.forEach((p) => Object.assign(p, { status: "idle", message: "" }));
  const notes: string[] = [];
  let failed = 0;
  const save = async (part: Part, name: string, data: Uint8Array) => {
    if (signal.aborted) throw new Error(t("video.cancelled"));
    const file = await saveDownloadedMedia("bilibili", name, data, "video");
    if (disposed || !entries.value.includes(e)) releaseSavedMedia([file]);
    else part.files.push(file);
    if (signal.aborted) throw new Error(t("video.cancelled"));
  };
  try {
    for (const [index, part] of parts.entries()) {
      if (signal.aborted) throw new Error(t("video.cancelled"));
      part.status = "working";
      releaseSavedMedia(part.files);
      part.files = [];
      const prefix = parts.length > 1 ? t("video.partPrefix", { page: part.page, i: index + 1, n: parts.length }) : "";
      const setProgress = (p: number) => e.progress = (index + p) / parts.length;
      const onProgress = (label: string, weight: number, offset: number) => (loaded: number, total: number) => {
        e.step = `${prefix}${label} ${formatBytes(loaded)}${total ? ` / ${formatBytes(total)}` : ""}`;
        setProgress(offset + (total ? Math.min(loaded / total, 1) * weight : 0));
      };
      try {
        const base = downloadBaseName(outputBaseName(e.info, part), `${e.info.bvid}_${part.cid}`);
        e.step = prefix + t("video.getUrl");
        const play = await getPlayInfo(e.info.bvid, part.cid, session.value);
        const video = pickVideo(play.videos, selectedQuality, selectedCodec);
        const audio = pickAudio(play.audios);
        if (video) {
          const audioData = audio ? await downloadStream(audio, session.value, onProgress(t("video.dlAudio"), 0.15, 0), signal) : null;
          const videoData = await downloadStream(video, session.value, onProgress(t("video.dlVideo"), audio ? 0.8 : 0.95, audio ? 0.15 : 0), signal);
          if (signal.aborted) throw new Error(t("video.cancelled"));
          e.step = prefix + t("video.merging");
          setProgress(0.97);
          const mp4 = await muxToMp4(videoData, audioData);
          await save(part, `${base}.mp4`, mp4);
          const codecName = { 7: "H.264", 12: "H.265", 13: "AV1" }[video.codecid ?? 0] ?? "";
          if (index === 0) notes.push(`${qualityName(video.id)}${codecName ? ` · ${codecName}` : ""} · ${formatBytes(mp4.length)}`);
        } else if (play.files.length) {
          for (const [i, f] of play.files.entries()) {
            const data = await downloadStream({ url: f.url }, session.value, onProgress(t("video.dlSegment", { n: i + 1 }), 0.95 / play.files.length, 0.95 * i / play.files.length), signal);
            const ext = f.url.match(/\.(mp4|flv)(?:$|\?)/i)?.[1] ?? "mp4";
            await save(part, `${base}${play.files.length > 1 ? `_${i + 1}` : ""}.${ext}`, data);
          }
        } else throw new Error(t("video.noStream"));
        part.status = "done";
        setProgress(1);
      } catch (err) {
        failed++;
        Object.assign(part, { status: "error", message: signal.aborted ? t("video.cancelled") : err instanceof Error ? err.message : String(err) });
        if (parts.length === 1 || signal.aborted) throw err;
      }
    }
    Object.assign(e, {
      status: failed && failed === parts.length ? "error" : "done",
      progress: 1,
      result: parts.length > 1 ? [t("video.partsResult", { ok: parts.length - failed, n: parts.length }), ...notes].join(t("video.sep")) : notes.join(t("video.sep")),
      message: failed ? t("video.partsFailed", { n: failed }) : "",
      expanded: e.expanded || failed > 0,
    });
  } catch (err) {
    Object.assign(e, { status: "error", message: signal.aborted ? t("video.cancelled") : err instanceof Error ? err.message : String(err) });
    if (!signal.aborted && !disposed) showError(err);
  } finally { e.step = ""; e.controller = undefined; }
};
const cancel = (e: Entry) => e.controller?.abort();
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
const pubdate = (time: number) => new Intl.DateTimeFormat(locale.value).format(new Date(time * 1000));

// ---------- 在线播放 ----------
const player = ref<{ entry: Entry; index: number; segment: number; url: string; quality: string; loading: boolean; error: string } | null>(null);
let playToken = 0;
const playPart = async (entry: Entry, index: number, segment = 0) => {
  const current = ++playToken;
  const part = entry.parts[index];
  player.value = { entry, index, segment, url: "", quality: "", loading: true, error: "" };
  const local = part.files[segment];
  if (local) {
    Object.assign(player.value, { url: local.url, quality: t("video.localPlayback"), loading: false });
    return;
  }
  try {
    const { url, quality } = await getPreviewUrl(entry.info.bvid, part.cid, session.value);
    if (current === playToken && player.value) Object.assign(player.value, { url, quality, loading: false });
  } catch (err) {
    if (current === playToken && player.value) Object.assign(player.value, { loading: false, error: err instanceof Error ? err.message : String(err) });
  }
};
/** 打开播放器：多 P 时从第一个勾选的分 P 开始 */
const openPlayer = (e: Entry) => {
  const first = e.parts.findIndex((p) => e.selected.includes(p.cid));
  playPart(e, Math.max(0, first));
};
const closePlayer = () => {
  playToken++;
  player.value = null;
};
/** 播放完自动播下一 P */
const onEnded = () => {
  const p = player.value;
  if (!p) return;
  if (p.segment < p.entry.parts[p.index].files.length - 1) playPart(p.entry, p.index, p.segment + 1);
  else if (p.index < p.entry.parts.length - 1) playPart(p.entry, p.index + 1);
};
const playFailed = () => {
  if (player.value) Object.assign(player.value, { url: "", loading: false, error: t("video.mediaPlayFailed") });
};
useWindowEvent("keydown", (ev) => {
  if (ev.key === "Escape" && player.value) closePlayer();
});
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(loginTimer);
  closePlayer();
  entries.value.forEach((e) => { e.controller?.abort(); releaseEntry(e); });
});
</script>

<template>
  <div class="bili">
    <!-- 链接 -->
    <div class="card bar">
      <input
        v-model="link"
        class="field link"
        :placeholder="t('video.biliPlaceholder')"
        spellcheck="false"
        @keydown.enter="parse"
      />
      <button class="btn subtle" :title="t('video.pasteTitle')" :disabled="parsing" @click="pasteAndParse"><ClipboardPaste :size="14" />{{ t("video.paste") }}</button>
      <button class="btn primary" :disabled="!link.trim() || parsing" @click="parse">
        <LoaderCircle v-if="parsing" :size="14" class="spin" />
        <Search v-else :size="14" />{{ t("video.parse") }}
      </button>
    </div>
    <p v-if="mode === 'browser'" class="banner warn">{{ t("video.biliBrowser") }}</p>

    <div class="main">
      <aside class="card panel">
        <section class="section">
          <h3>{{ t("video.quality") }}</h3>
          <AppSelect v-model="quality" :options="qualityOptions" />
          <p class="tip">{{ t("video.qualityTip") }}</p>
          <h3>{{ t("video.codec") }}</h3>
          <AppSelect v-model="codec" :options="CODECS" />
          <p class="tip">{{ t("video.codecTip") }}</p>
        </section>

        <section class="section">
          <h3 class="login-head" @click="showLogin = !showLogin">
            <UserRound :size="13" />
            <span v-if="checkingLogin">{{ t("video.checkingLogin") }}</span>
            <span v-else-if="login?.isLogin">{{ t("video.loggedIn", { name: login.name }) }}{{ login.vip ? t("video.vip") : "" }}</span>
            <span v-else>{{ t("video.notLoggedIn") }}</span>
            <span class="push link-text">{{ showLogin ? t("video.collapse") : t("video.settings") }}</span>
          </h3>
          <template v-if="showLogin">
            <input v-model="sessdata" class="field mono" type="password" :placeholder="t('video.sessdataPlaceholder')" spellcheck="false" autocomplete="off" />
            <p class="tip">
              {{ t("video.sessdataTip") }}
            </p>
            <button v-if="sessdata" class="btn small subtle" @click="sessdata = ''">{{ t("video.clear") }}</button>
          </template>
        </section>
      </aside>

      <!-- 解析过的视频 -->
      <section class="card list">
        <div class="card-title">
          {{ t("video.videos") }}<span v-if="entries.length" class="count">{{ t("video.countN", { n: entries.length }) }}</span>
          <div class="push actions">
            <button v-if="entries.length > 1" class="btn small subtle" :disabled="busy || mode === 'browser'" @click="downloadAll"><Download :size="13" />{{ t("video.downloadAll") }}</button>
            <button v-if="entries.length" class="btn small subtle" :disabled="busy" @click="clearEntries">{{ t("video.clear") }}</button>
          </div>
        </div>

        <div class="results">
          <ProcessingMascot
            v-if="parsing"
            class="results-overlay"
            :title="t('video.parse')"
            :detail="t('video.parsing')"
          />

          <div v-if="!entries.length && !parsing" class="empty">
            <p>{{ t("video.biliEmptyHint") }}</p>
            <p class="sub">{{ t("video.biliEmptySub") }}</p>
          </div>

          <div v-else-if="entries.length" class="grid">
            <article v-for="e in entries" :key="e.key" class="video" :class="e.status">
              <div class="thumb" :title="t('video.play')" @click="openPlayer(e)">
                <img :src="e.info.cover" alt="" referrerpolicy="no-referrer" loading="lazy" />
                <span class="play-icon"><Play :size="22" /></span>
                <span class="badge left">{{ formatDuration(e.info.duration) }}</span>
                <span v-if="e.info.pages.length > 1" class="badge right">{{ e.info.pages.length }} P</span>
                <button class="close" :title="t('video.remove')" @click.stop="removeEntry(e)"><X :size="13" /></button>
              </div>

              <div class="body">
                <h4 class="title" :title="e.info.title">{{ e.info.title }}</h4>
                <p class="meta">{{ e.info.owner }} · {{ pubdate(e.info.pubdate) }}</p>
                <p class="meta">
                  <template v-if="e.qualities.length">{{ t("video.bestAvailable", { q: e.qualities[0].label }) }}<template v-if="actualQuality(e)">{{ t("video.willDownload", { q: actualQuality(e)!.label }) }}</template></template>
                  <template v-else>{{ t("video.qualityUnknown") }}</template>
                </p>

                <!-- 多 P：展开勾选 -->
                <template v-if="e.parts.length > 1">
                  <button class="parts-toggle" @click="e.expanded = !e.expanded">
                    {{ t("video.partsSelected", { n: e.selected.length, total: e.parts.length }) }}
                    <ChevronUp v-if="e.expanded" :size="13" />
                    <ChevronDown v-else :size="13" />
                  </button>
                  <div v-if="e.expanded" class="parts">
                    <label class="part all">
                      <input
                        type="checkbox"
                        class="file-check"
                        :checked="e.selected.length === e.parts.length"
                        :indeterminate="e.selected.length > 0 && e.selected.length < e.parts.length"
                        :disabled="e.status === 'working'"
                        @change="toggleAllParts(e)"
                      />{{ t("video.selectAll") }}
                    </label>
                    <label v-for="p in e.parts" :key="p.cid" class="part" :title="p.message || p.part">
                      <input type="checkbox" class="file-check" :checked="e.selected.includes(p.cid)" :disabled="e.status === 'working'" @change="togglePart(e, p)" />
                      <span class="no">P{{ p.page }}</span>
                      <span class="name">{{ p.part }}</span>
                      <LoaderCircle v-if="p.status === 'working'" :size="12" class="spin accent" />
                      <CircleCheck v-else-if="p.status === 'done'" :size="12" class="ok" />
                      <CircleAlert v-else-if="p.status === 'error'" :size="12" class="bad" />
                      <span v-else class="dur">{{ formatDuration(p.duration) }}</span>
                    </label>
                  </div>
                </template>

                <div v-if="e.status === 'working'" class="download-progress"><ProgressBar :value="e.progress" /><p class="status">{{ e.step }} · {{ Math.round(e.progress * 100) }}%</p></div>
                <p v-else-if="e.status === 'done'" class="status ok">{{ t("video.savedResult", { result: e.result }) }}<template v-if="e.message">{{ t("video.paren", { text: e.message }) }}</template></p>
                <p v-else-if="e.status === 'error'" class="status bad">{{ e.message }}</p>

                <div class="foot">
                  <button v-if="e.status === 'working'" class="btn small" @click="cancel(e)"><Square :size="12" /><span>{{ t("video.cancel") }}</span></button>
                  <button
                    v-else
                    class="btn small primary"
                    :disabled="!e.selected.length || mode === 'browser'"
                    @click="download(e)"
                  >
                    <Download :size="13" /><span>{{ e.status === "done" ? t("video.redownload") : e.parts.length > 1 ? t("video.downloadParts", { n: e.selected.length }) : t("video.download") }}</span>
                  </button>
                  <button class="btn small subtle" :title="t('video.play')" @click="openPlayer(e)"><Play :size="13" /><span>{{ t("video.play") }}</span></button>
                  <button v-if="desktop && e.status !== 'working' && savedFile(e)" class="btn small subtle" :title="t('video.openFolder')" @click="reveal(e)"><ExternalLink :size="13" /><span>{{ t("video.openFolder") }}</span></button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <!-- 在线播放：覆盖在工具上方 -->
    <div v-if="player" class="player-mask" @click.self="closePlayer">
      <div class="player">
        <div class="player-head">
          <div class="player-title">
            <strong :title="player.entry.info.title">{{ player.entry.info.title }}</strong>
            <span v-if="player.entry.parts.length > 1">P{{ player.entry.parts[player.index].page }} {{ player.entry.parts[player.index].part }}</span>
          </div>
          <span v-if="player.quality" class="player-quality">{{ player.quality }}</span>
          <button class="icon-btn" :title="t('video.closeEsc')" @click="closePlayer"><X :size="16" /></button>
        </div>
        <div class="screen">
          <video v-if="player.url" :key="player.url" :src="player.url" controls autoplay @ended="onEnded" @error="playFailed" />
          <span v-else-if="player.loading" class="screen-state"><LoaderCircle :size="18" class="spin" />{{ t("video.gettingPlayUrl") }}</span>
          <span v-else class="screen-state bad">{{ player.error }}</span>
        </div>
        <div v-if="player.entry.parts.length > 1" class="player-foot">
          <button class="btn small subtle" :disabled="player.index === 0" @click="playPart(player.entry, player.index - 1)"><SkipBack :size="13" />{{ t("video.prevPart") }}</button>
          <AppSelect
            class="part-select"
            :model-value="player.index"
            :options="player.entry.parts.map((p, i) => ({ value: i, label: `P${p.page} ${p.part}` }))"
            @update:model-value="playPart(player!.entry, $event)"
          />
          <button class="btn small subtle" :disabled="player.index >= player.entry.parts.length - 1" @click="playPart(player.entry, player.index + 1)">
            {{ t("video.nextPart") }}<SkipForward :size="13" />
          </button>
        </div>
        <p class="player-tip">{{ t("video.localPlaybackTip") }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bili {
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
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.tip {
  line-height: 1.6;
}
.login-head {
  cursor: pointer;
}
.push {
  margin-left: auto;
}
.link-text {
  font-weight: 400;
  color: var(--accent);
}
.section > .btn.small {
  align-self: flex-start;
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
  margin: 0;
}
.empty .sub {
  max-width: 420px;
  font-size: 12px;
  line-height: 1.6;
}
/* 视频卡片：按宽度自动排列 */
.grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
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
.thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--bg-sunken);
  cursor: pointer;
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
.thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.badge {
  position: absolute;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.badge.left {
  left: 6px;
}
.badge.right {
  right: 6px;
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
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px 12px;
}
.title {
  margin: 0;
  font-size: 13.5px;
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
.parts-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  color: var(--accent);
}
.parts {
  max-height: 200px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.part {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.part:hover {
  background: var(--hover);
}
.part.all {
  color: var(--text-2);
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  margin-bottom: 2px;
}
.part .no {
  flex-shrink: 0;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.part .name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.part .dur {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.status {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}
.status.ok,
.ok {
  color: var(--success);
}
.status.bad,
.bad {
  color: var(--danger);
}
.accent {
  color: var(--accent);
}
.foot {
  display: flex;
  flex-wrap: nowrap;
  min-width: 0;
  gap: 4px;
  margin-top: auto;
  padding-top: 8px;
}
.foot .btn { flex: 0 1 auto; min-width: 0; gap: 4px; padding: 0 6px; }
.foot .btn > svg { flex-shrink: 0; }
.foot .btn > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 播放器 */
.player-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 32px;
  background: rgba(0, 0, 0, 0.6);
}
.player {
  width: min(1100px, 100%);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 10px;
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.player-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.player-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 13px;
}
.player-title strong,
.player-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.player-title span {
  font-size: 12px;
  color: var(--text-3);
}
.player-quality {
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-2);
}
.screen {
  position: relative;
  aspect-ratio: 16 / 9;
  max-height: calc(100vh - 200px);
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #000;
  overflow: hidden;
}
.screen video {
  width: 100%;
  height: 100%;
  background: #000;
}
.screen-state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #ccc;
}
.player-foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.part-select {
  flex: 1;
  min-width: 0;
}
.player-tip {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-3);
}
.download-progress { display: flex; flex-direction: column; gap: 5px; padding-top: 6px; }
</style>
