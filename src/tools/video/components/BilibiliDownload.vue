<script setup lang="ts">
import { computed, markRaw, onMounted, ref, watch } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  ClipboardPaste,
  Download,
  ExternalLink,
  FolderOpen,
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
import { useStoredRef } from "@/composables/useStoredRef";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { pickFolder, saveFile, saveIntoFolder } from "@/utils/saveFile";
import { formatBytes } from "@/utils/format";
import { sendMode } from "@/tools/network/http";
import { formatDuration } from "../media";
import {
  CODEC_LABELS,
  QUALITY_NAMES,
  downloadFile,
  downloadStream,
  getLoginInfo,
  getPlayInfo,
  getPreviewUrl,
  getVideoInfo,
  muxToMp4,
  outputBaseName,
  pickAudio,
  pickVideo,
  safeFileName,
  type CodecPreference,
  type LoginInfo,
  type Session,
  type VideoInfo,
  type VideoPage,
} from "../bilibili";

/**
 * B 站视频下载：粘贴视频链接解析，解析过的视频以卡片形式排在右侧（显示封面），每个都可以单独下载。
 * 左侧设置下载内容（视频、音频、封面、弹幕）、清晰度、编码、保存位置和登录。
 * 多 P 视频在卡片里展开勾选要下载的分 P。画面和声音下载后直接合并为 MP4，不重新编码。
 * 点封面可以在工具里在线播放（最高 720P），多 P 可以切换。
 */
const mode = sendMode();
const desktop = isTauri();

// ---------- 登录（可选） ----------
const sessdata = useStoredRef("bilibili.sessdata", "");
const session = computed<Session>(() => ({ sessdata: sessdata.value }));
const login = ref<LoginInfo | null>(null);
const checkingLogin = ref(false);
const showLogin = ref(false);
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
const quality = useStoredRef("bilibili.quality", 80);
const codec = useStoredRef<CodecPreference>("bilibili.codec", "avc");
const want = useStoredRef("bilibili.want", { video: true, audio: false, cover: false, danmaku: false });
/** 桌面版的保存位置：第一次下载时选择，之后都保存到这里 */
const folder = useStoredRef("bilibili.folder", "");
const CODECS = Object.entries(CODEC_LABELS).map(([value, label]) => ({ value: value as CodecPreference, label }));
const nothingWanted = computed(() => !want.value.video && !want.value.audio && !want.value.cover && !want.value.danmaku);
const changeFolder = async () => {
  const picked = await pickFolder("选择保存位置");
  if (picked) folder.value = picked;
  return picked;
};
const revealFolder = async (path: string) => {
  // 在资源管理器中显示（opener 默认权限允许这个操作）
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  revealItemInDir(path).catch(() => {});
};

// ---------- 解析过的视频 ----------
interface Part extends VideoPage {
  status: "idle" | "working" | "done" | "error";
  message: string;
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

const qualityOptions = computed(() => {
  // 清晰度选项：所有解析过的视频里出现过的；还没有解析时列出全部
  const ids = new Set(entries.value.flatMap((e) => e.qualities.map((q) => q.id)));
  const list = ids.size ? [...ids] : Object.keys(QUALITY_NAMES).map(Number);
  return list.sort((a, b) => b - a).map((id) => ({ value: id, label: QUALITY_NAMES[id] ?? `清晰度 ${id}` }));
});
/** 这个视频实际会下载的清晰度：所选的拿不到时用能拿到的最高一档 */
const actualQuality = (e: Entry) => e.qualities.find((q) => q.id <= quality.value) ?? e.qualities[e.qualities.length - 1];

const link = ref("");
const parsing = ref(false);
const parseError = ref("");
const parse = async () => {
  if (parsing.value || !link.value.trim()) return;
  parsing.value = true;
  parseError.value = "";
  try {
    const { info, page } = await getVideoInfo(link.value, session.value);
    // 用第一 P 查询当前账号能下载的清晰度
    const play = await getPlayInfo(info.bvid, info.pages[0].cid, session.value).catch(() => null);
    const target = page ? info.pages.find((p) => p.page === page) : null;
    const entry: Entry = {
      key: info.bvid,
      info,
      qualities: play?.qualities ?? [],
      parts: info.pages.map((p) => ({ ...p, status: "idle", message: "" })),
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

// 分 P 勾选
const togglePart = (e: Entry, p: Part) => (e.selected = e.selected.includes(p.cid) ? e.selected.filter((c) => c !== p.cid) : [...e.selected, p.cid]);
const toggleAllParts = (e: Entry) => (e.selected = e.selected.length === e.parts.length ? [] : e.parts.map((p) => p.cid));

// ---------- 下载 ----------
const download = async (e: Entry) => {
  if (e.status === "working" || !e.selected.length || nothingWanted.value) return;
  // 桌面版：保存到选好的文件夹，每下载完一个就写进去；浏览器：逐个下载
  let dir = "";
  if (desktop) {
    dir = folder.value || (await changeFolder()) || "";
    if (!dir) return;
  }
  const save = (name: string, data: Uint8Array) => (dir ? saveIntoFolder(dir, name, data) : saveFile(data, name).then(() => {}));

  const v = e.info;
  const parts = e.parts.filter((p) => e.selected.includes(p.cid));
  const controller = new AbortController();
  const signal = controller.signal;
  // AbortController 不能被响应式代理包装（调用 abort 会出错），用 markRaw 原样保存
  Object.assign(e, { status: "working", step: "准备下载", progress: 0, message: "", result: "", controller: markRaw(controller) });
  parts.forEach((p) => Object.assign(p, { status: "idle", message: "" }));
  const notes: string[] = [];
  let failed = 0;
  try {
    if (want.value.cover) {
      e.step = "下载封面";
      const ext = v.cover.match(/\.(jpe?g|png|webp|gif)(?:$|\?)/i)?.[1] ?? "jpg";
      await save(`${safeFileName(v.title)}.${ext}`, await downloadFile(v.cover, session.value)).catch(() => {});
      notes.push("封面");
    }
    for (const [index, part] of parts.entries()) {
      if (signal.aborted) break;
      part.status = "working";
      const prefix = parts.length > 1 ? `P${part.page}（${index + 1}/${parts.length}）` : "";
      // 整体进度：已完成的分 P + 当前分 P 的进度
      const setProgress = (p: number) => (e.progress = (index + p) / parts.length);
      try {
        const base = outputBaseName(v, part);
        if (want.value.video || want.value.audio) {
          e.step = `${prefix}获取下载地址`;
          const play = await getPlayInfo(v.bvid, part.cid, session.value);
          const video = pickVideo(play.videos, quality.value, codec.value);
          const audio = pickAudio(play.audios);
          const onProgress = (label: string, weight: number, offset: number) => (loaded: number, total: number) => {
            e.step = `${prefix}${label} ${formatBytes(loaded)}${total ? ` / ${formatBytes(total)}` : ""}`;
            setProgress(offset + (total ? (loaded / total) * weight : 0));
          };
          if (video || audio) {
            // DASH：画面、声音分开下载，再合并
            const audioData = audio ? await downloadStream(audio, session.value, onProgress("下载声音", want.value.video ? 0.15 : 0.9, 0), signal) : null;
            if (want.value.video && video) {
              const videoData = await downloadStream(video, session.value, onProgress("下载画面", 0.8, audio ? 0.15 : 0), signal);
              e.step = `${prefix}合并画面和声音`;
              setProgress(0.97);
              const mp4 = await muxToMp4(videoData, audioData);
              await save(`${base}.mp4`, mp4);
              const codecName = { 7: "H.264", 12: "H.265", 13: "AV1" }[video.codecid ?? 0] ?? "";
              if (index === 0) notes.unshift(`${QUALITY_NAMES[video.id] ?? video.id}${codecName ? ` · ${codecName}` : ""} · ${formatBytes(mp4.length)}`);
            }
            if (want.value.audio && audioData) {
              await save(`${base}.m4a`, await muxToMp4(null, audioData));
              if (index === 0) notes.push("音频");
            }
          } else if (play.files.length) {
            // 老视频没有 DASH：直接下载完整文件
            for (const [i, f] of play.files.entries()) {
              const data = await downloadStream({ url: f.url }, session.value, onProgress(`下载第 ${i + 1} 段`, 0.95 / play.files.length, (0.95 * i) / play.files.length), signal);
              const ext = f.url.match(/\.(mp4|flv)(?:$|\?)/i)?.[1] ?? "mp4";
              await save(`${base}${play.files.length > 1 ? `_${i + 1}` : ""}.${ext}`, data);
            }
          } else throw new Error("没有可以下载的视频流（可能需要登录或大会员）");
        }
        if (want.value.danmaku) {
          e.step = `${prefix}下载弹幕`;
          await save(`${base}.xml`, await downloadFile(`https://comment.bilibili.com/${part.cid}.xml`, session.value));
          if (index === 0) notes.push("弹幕");
        }
        part.status = "done";
        setProgress(1);
      } catch (err) {
        failed++;
        Object.assign(part, { status: "error", message: signal.aborted ? "已取消" : err instanceof Error ? err.message : String(err) });
        if (parts.length === 1 || signal.aborted) throw err;
      }
    }
    if (signal.aborted) throw new Error("已取消");
    const okCount = parts.length - failed;
    Object.assign(e, {
      status: failed && !okCount ? "error" : "done",
      result: parts.length > 1 ? `${okCount} / ${parts.length} 个分 P${notes.length ? `，${notes.join("，")}` : ""}` : notes.join("，"),
      message: failed ? `${failed} 个分 P 下载失败，展开查看原因` : "",
      expanded: e.expanded || failed > 0,
    });
  } catch (err) {
    Object.assign(e, { status: "error", message: signal.aborted ? "已取消" : err instanceof Error ? err.message : String(err) });
  } finally {
    e.step = "";
    e.controller = undefined;
  }
};
const cancel = (e: Entry) => e.controller?.abort();
const downloadAll = () => entries.value.filter((e) => e.status !== "working").forEach((e) => download(e));

const pubdate = (t: number) => new Date(t * 1000).toLocaleDateString();

// ---------- 在线播放 ----------
const player = ref<{ entry: Entry; index: number; url: string; quality: string; loading: boolean; error: string } | null>(null);
let playToken = 0;
const playPart = async (entry: Entry, index: number) => {
  const current = ++playToken;
  const part = entry.parts[index];
  player.value = { entry, index, url: "", quality: "", loading: true, error: "" };
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
  if (p && p.index < p.entry.parts.length - 1) playPart(p.entry, p.index + 1);
};
useWindowEvent("keydown", (ev) => {
  if (ev.key === "Escape" && player.value) closePlayer();
});
</script>

<template>
  <div class="bili">
    <!-- 链接 -->
    <div class="card bar">
      <input
        v-model="link"
        class="field link"
        placeholder="粘贴 B 站视频链接、BV 号或 b23.tv 分享链接，回车解析；可以连续解析多个"
        spellcheck="false"
        @keydown.enter="parse"
      />
      <button class="btn subtle" title="粘贴剪贴板中的链接并解析" :disabled="parsing" @click="pasteAndParse"><ClipboardPaste :size="14" />粘贴</button>
      <button class="btn primary" :disabled="!link.trim() || parsing" @click="parse">
        <LoaderCircle v-if="parsing" :size="14" class="spin" />
        <Search v-else :size="14" />解析
      </button>
    </div>
    <p v-if="mode === 'browser'" class="banner warn">浏览器中无法下载 B 站视频（需要设置 Referer 请求头），请使用桌面版。</p>
    <p v-if="parseError" class="banner error">{{ parseError }}</p>

    <div class="main">
      <!-- 左：设置 -->
      <aside class="card panel">
        <section class="section">
          <h3>下载内容</h3>
          <div class="wants">
            <label class="check"><input v-model="want.video" type="checkbox" />视频（MP4，画面 + 声音）</label>
            <label class="check"><input v-model="want.audio" type="checkbox" />仅音频（M4A）</label>
            <label class="check"><input v-model="want.cover" type="checkbox" />封面图片</label>
            <label class="check"><input v-model="want.danmaku" type="checkbox" />弹幕（XML）</label>
          </div>
        </section>

        <section v-if="want.video" class="section">
          <h3>清晰度</h3>
          <AppSelect v-model="quality" :options="qualityOptions" />
          <p class="tip">视频没有所选清晰度时，自动下载它能拿到的最高一档。</p>
          <h3>编码</h3>
          <AppSelect v-model="codec" :options="CODECS" />
          <p class="tip">H.264 几乎所有播放器都能播放；视频没有所选编码时自动换成其他编码。</p>
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
          <h3 class="login-head" @click="showLogin = !showLogin">
            <UserRound :size="13" />
            <span v-if="checkingLogin">正在检查登录状态…</span>
            <span v-else-if="login?.isLogin">已登录：{{ login.name }}{{ login.vip ? "（大会员）" : "" }}</span>
            <span v-else>未登录（最高 480P）</span>
            <span class="push link-text">{{ showLogin ? "收起" : "设置" }}</span>
          </h3>
          <template v-if="showLogin">
            <input v-model="sessdata" class="field mono" type="password" placeholder="SESSDATA" spellcheck="false" autocomplete="off" />
            <p class="tip">
              填写自己账号的 SESSDATA 后可以下载 1080P，大会员可以下载 4K 等。获取方法：在浏览器登录 B 站 → 按 F12 → 「应用」（Application）→ Cookie → www.bilibili.com，复制 SESSDATA 的值。只保存在本机，相当于登录凭据，请勿泄露给他人。
            </p>
            <button v-if="sessdata" class="btn small subtle" @click="sessdata = ''">清除</button>
          </template>
        </section>
      </aside>

      <!-- 右：解析过的视频 -->
      <section class="card list">
        <div class="card-title">
          视频<span v-if="entries.length" class="count">{{ entries.length }} 个</span>
          <div class="push actions">
            <button v-if="entries.length > 1" class="btn small subtle" :disabled="nothingWanted || mode === 'browser'" @click="downloadAll"><Download :size="13" />全部下载</button>
            <button v-if="entries.length" class="btn small subtle" :disabled="entries.some((e) => e.status === 'working')" @click="entries = []">清空</button>
          </div>
        </div>

        <div v-if="!entries.length" class="empty">
          <p>粘贴视频链接后回车或点「解析」，解析过的视频会排在这里</p>
          <p class="sub">支持普通视频（含多 P）；番剧、电影、付费内容不支持。仅供个人学习使用，请尊重 UP 主的版权。</p>
        </div>

        <div v-else class="grid">
          <article v-for="e in entries" :key="e.key" class="video" :class="e.status">
            <div class="thumb" title="在线播放" @click="openPlayer(e)">
              <img :src="e.info.cover" alt="" referrerpolicy="no-referrer" loading="lazy" />
              <span class="play-icon"><Play :size="22" /></span>
              <span class="badge left">{{ formatDuration(e.info.duration) }}</span>
              <span v-if="e.info.pages.length > 1" class="badge right">{{ e.info.pages.length }} P</span>
              <button class="close" title="移除" @click.stop="removeEntry(e)"><X :size="13" /></button>
              <!-- 下载进度盖在画面底部 -->
              <span v-if="e.status === 'working'" class="progress"><i :style="{ width: `${Math.round(e.progress * 100)}%` }" /></span>
            </div>

            <div class="body">
              <h4 class="title" :title="e.info.title">{{ e.info.title }}</h4>
              <p class="meta">{{ e.info.owner }} · {{ pubdate(e.info.pubdate) }}</p>
              <p class="meta">
                <template v-if="e.qualities.length">可下载最高 {{ e.qualities[0].label }}<template v-if="want.video && actualQuality(e)"> · 将下载 {{ actualQuality(e)!.label }}</template></template>
                <template v-else>清晰度未知</template>
              </p>

              <!-- 多 P：展开勾选 -->
              <template v-if="e.parts.length > 1">
                <button class="parts-toggle" @click="e.expanded = !e.expanded">
                  已选 {{ e.selected.length }} / {{ e.parts.length }} 个分 P
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
                    />全选
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

              <p v-if="e.status === 'working'" class="status">{{ e.step }}</p>
              <p v-else-if="e.status === 'done'" class="status ok">已保存：{{ e.result }}<template v-if="e.message">（{{ e.message }}）</template></p>
              <p v-else-if="e.status === 'error'" class="status bad">{{ e.message }}</p>

              <div class="foot">
                <button v-if="e.status === 'working'" class="btn small" @click="cancel(e)"><Square :size="12" />取消</button>
                <button
                  v-else
                  class="btn small primary"
                  :disabled="!e.selected.length || nothingWanted || mode === 'browser'"
                  :title="nothingWanted ? '请在左侧勾选下载内容' : ''"
                  @click="download(e)"
                >
                  <Download :size="13" />{{ e.status === "done" ? "重新下载" : e.parts.length > 1 ? `下载 ${e.selected.length} 个分 P` : "下载" }}
                </button>
                <button class="btn small subtle" title="在线播放（最高 720P）" @click="openPlayer(e)"><Play :size="13" />播放</button>
                <button v-if="e.status === 'done' && desktop && folder" class="btn small subtle" @click="revealFolder(folder)"><ExternalLink :size="13" />打开文件夹</button>
              </div>
            </div>
          </article>
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
          <button class="icon-btn" title="关闭（Esc）" @click="closePlayer"><X :size="16" /></button>
        </div>
        <div class="screen">
          <video v-if="player.url" :key="player.url" :src="player.url" controls autoplay @ended="onEnded" />
          <span v-else-if="player.loading" class="screen-state"><LoaderCircle :size="18" class="spin" />正在获取播放地址…</span>
          <span v-else class="screen-state bad">{{ player.error }}</span>
        </div>
        <div v-if="player.entry.parts.length > 1" class="player-foot">
          <button class="btn small subtle" :disabled="player.index === 0" @click="playPart(player.entry, player.index - 1)"><SkipBack :size="13" />上一 P</button>
          <AppSelect
            class="part-select"
            :model-value="player.index"
            :options="player.entry.parts.map((p, i) => ({ value: i, label: `P${p.page} ${p.part}` }))"
            @update:model-value="playPart(player!.entry, $event)"
          />
          <button class="btn small subtle" :disabled="player.index >= player.entry.parts.length - 1" @click="playPart(player.entry, player.index + 1)">
            下一 P<SkipForward :size="13" />
          </button>
        </div>
        <p class="player-tip">在线播放最高 720P，下载可以选择更高清晰度。</p>
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
.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
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
.wants {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
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
.btn.small {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
}
.section > .btn.small {
  align-self: flex-start;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
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
.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: rgba(0, 0, 0, 0.3);
}
.progress i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
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
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
}
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
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
