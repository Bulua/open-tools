<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  FileText,
  LoaderCircle,
  Pencil,
  RotateCw,
  Trash2,
} from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";
import { showError } from "@/utils/errorToast";
import { openExternal } from "@/utils/openExternal";
import { saveFile } from "@/utils/saveFile";
import { readLocalImageForPreview, resolveConversationWorkspaceDir } from "../builtinTools";
import { inferCodeFileName, renderChatMarkdown, type ParsedFileLink } from "../markdown";
import type { ChatMessage, ChatMessagePart } from "@/types/ai";
import AiToolCallItem from "./AiToolCallItem.vue";

const props = defineProps<{
  message: ChatMessage;
  streaming: boolean;
  conversationId?: string;
  workspaceDir?: string;
}>();

const emit = defineEmits<{
  regenerate: [id: string];
  edit: [id: string, content: string];
  delete: [id: string];
  openFile: [ref: ParsedFileLink];
}>();

const { t } = useI18n();
const { copy } = useClipboard();

const copied = ref(false);
let copyTimer = 0;

const editing = ref(false);
const editText = ref("");

const expandedGroups = reactive<Record<string, boolean>>({});
const userToggledGroups = reactive<Record<string, boolean>>({});
const expandedReasoning = reactive<Record<string, boolean>>({});
const userToggledReasoning = reactive<Record<string, boolean>>({});

/** 按真实发生顺序排列的分段；旧版未记录 parts 的历史消息自动回退为兼容顺序 */
const displayParts = computed<ChatMessagePart[]>(() => {
  if (props.message.role !== "assistant") return [];
  if (props.message.parts?.length) {
    return props.message.parts.filter((part) => {
      if (part.type === "text" || part.type === "reasoning") return part.text.length > 0;
      return true;
    });
  }
  const fallback: ChatMessagePart[] = [];
  if (props.message.reasoning) {
    fallback.push({ id: "legacy-reasoning", type: "reasoning", text: props.message.reasoning });
  }
  if (props.message.content) {
    fallback.push({ id: "legacy-text", type: "text", text: props.message.content });
  }
  return fallback;
});

type ProcessItem = Extract<ChatMessagePart, { type: "reasoning" | "tool" }>;
type DisplayBlock =
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "process"; items: ProcessItem[] };

/** 将相邻连续的思考与工具调用合并为可统一折叠的过程分组，文本段保持交错顺序 */
const displayBlocks = computed<DisplayBlock[]>(() => {
  const blocks: DisplayBlock[] = [];
  for (const part of displayParts.value) {
    if (part.type === "text") {
      blocks.push({ id: part.id, kind: "text", text: part.text });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && last.kind === "process") {
      last.items.push(part);
    } else {
      blocks.push({ id: `grp-${part.id}`, kind: "process", items: [part] });
    }
  }
  return blocks;
});

function isSingleReasoning(block: Extract<DisplayBlock, { kind: "process" }>): boolean {
  return block.items.length === 1 && block.items[0].type === "reasoning";
}

function isBlockStreaming(blockIdx: number): boolean {
  return props.streaming && blockIdx === displayBlocks.value.length - 1;
}

function processSummary(block: Extract<DisplayBlock, { kind: "process" }>, blockIdx: number): string {
  const active = isBlockStreaming(blockIdx);
  const toolCount = block.items.filter((item) => item.type === "tool").length;
  const hasReasoning = block.items.some((item) => item.type === "reasoning");
  const runningTool = block.items.some((item) => item.type === "tool" && item.call.status === "running");

  if (active) {
    if (runningTool) return t("ai.processRunningTools", { n: toolCount });
    if (toolCount > 0) return t("ai.processWorkingWithTools", { n: toolCount });
    return t("ai.thinkingInProgress");
  }
  if (hasReasoning && toolCount > 0) return t("ai.processThoughtAndTools", { n: toolCount });
  if (toolCount > 0) return t("ai.processToolsOnly", { n: toolCount });
  return t("ai.thinking");
}

function processHasError(block: Extract<DisplayBlock, { kind: "process" }>): boolean {
  return block.items.some((item) => item.type === "tool" && item.call.status === "error");
}

// 正在进行的末尾过程分组自动展开；完成后或下方开始输出正文时自动柔和收起
watch(
  () => [props.streaming, displayBlocks.value.map((b) => `${b.id}:${b.kind}:${b.kind === "process" ? b.items.length : 0}`).join(",")],
  () => {
    const blocks = displayBlocks.value;
    blocks.forEach((block, idx) => {
      if (block.kind !== "process") return;
      const isActiveTail = props.streaming && idx === blocks.length - 1;
      if (!userToggledGroups[block.id]) {
        expandedGroups[block.id] = isActiveTail;
      }
      block.items.forEach((item, itemIdx) => {
        if (item.type !== "reasoning" || userToggledReasoning[item.id]) return;
        expandedReasoning[item.id] = isActiveTail && itemIdx === block.items.length - 1;
      });
    });
  },
  { immediate: true },
);

const toggleGroup = (groupId: string) => {
  userToggledGroups[groupId] = true;
  expandedGroups[groupId] = !expandedGroups[groupId];
};

const toggleReasoning = (partId: string) => {
  userToggledReasoning[partId] = true;
  expandedReasoning[partId] = !expandedReasoning[partId];
};

const isReasoningItemStreaming = (blockIdx: number, itemIdx: number, itemsLen: number) =>
  isBlockStreaming(blockIdx) && itemIdx === itemsLen - 1;

const renderText = (source: string) => renderChatMarkdown(source);

const assistantRef = ref<HTMLElement>();
const userImageUrls = reactive<Record<string, string>>({});
let hydrateSeq = 0;

/** 为用户消息中已落盘的图片附件按需加载缩略图（避免在会话 JSON 里重复存储 base64） */
async function hydrateUserAttachments() {
  if (props.message.role !== "user" || !props.message.attachments?.length) return;
  const targets = props.message.attachments.filter(
    (att) => att.kind === "image" && !att.dataUrl && Boolean(att.filePath) && !userImageUrls[att.id],
  );
  if (!targets.length) return;
  let wsDir: string;
  try {
    wsDir = await resolveConversationWorkspaceDir(props.conversationId || "draft", props.workspaceDir);
  } catch {
    return;
  }
  await Promise.all(
    targets.map(async (att) => {
      if (!att.filePath) return;
      try {
        const preview = await readLocalImageForPreview(wsDir, att.filePath);
        userImageUrls[att.id] = preview.dataUrl;
      } catch {
        // 文件可能已被用户手动移走，忽略预览失败
      }
    }),
  );
}

/** 将 Markdown 中引用的本地 file:// 图片通过后端读取并内联显示 */
async function hydrateLocalImages() {
  const root = assistantRef.value;
  if (!root) return;
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img.ai-local-img[data-local-image-path]"));
  if (!imgs.length) return;
  const seq = ++hydrateSeq;
  let wsDir: string;
  try {
    wsDir = await resolveConversationWorkspaceDir(props.conversationId || "draft", props.workspaceDir);
  } catch {
    return;
  }
  if (seq !== hydrateSeq) return;

  await Promise.all(
    imgs.map(async (img) => {
      const rawPath = img.dataset.localImagePath?.trim();
      if (!rawPath || img.dataset.loadedPath === rawPath) return;
      try {
        const preview = await readLocalImageForPreview(wsDir, rawPath);
        if (seq !== hydrateSeq) return;
        img.src = preview.dataUrl;
        img.dataset.loadedPath = rawPath;
        img.classList.add("loaded");
      } catch {
        img.classList.add("failed");
      }
    }),
  );
}

onMounted(() => {
  void nextTick(hydrateLocalImages);
  void hydrateUserAttachments();
});

watch(
  [() => props.message.attachments?.map((a) => `${a.id}:${a.filePath ?? ""}`).join(","), () => props.workspaceDir],
  () => {
    void hydrateUserAttachments();
  },
);

watch(
  [() => displayBlocks.value.map((b) => (b.kind === "text" ? b.text : "")).join("\0"), () => props.workspaceDir],
  () => {
    void nextTick(hydrateLocalImages);
  },
);

const durationLabel = computed(() => {
  if (!props.message.durationMs) return "";
  const sec = (props.message.durationMs / 1000).toFixed(1);
  return t("ai.durationSec", { sec });
});

async function copyMessage() {
  if (!props.message.content) return;
  await copy(props.message.content);
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => (copied.value = false), 1500);
}

function startEdit() {
  editText.value = props.message.content;
  editing.value = true;
}

function submitEdit() {
  const next = editText.value.trim();
  if (!next) return;
  editing.value = false;
  emit("edit", props.message.id, next);
}

async function onMarkdownClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const downloadBtn = target.closest<HTMLButtonElement>(".ai-code-download");
  if (downloadBtn) {
    const raw = downloadBtn.dataset.code ?? "";
    const lang = downloadBtn.dataset.lang ?? "";
    try {
      const code = decodeURIComponent(raw);
      const fileName = inferCodeFileName(code, lang);
      const saved = await saveFile(new TextEncoder().encode(code), fileName);
      if (saved) {
        const original = downloadBtn.textContent;
        downloadBtn.textContent = t("ai.downloaded");
        downloadBtn.classList.add("ok");
        window.setTimeout(() => {
          downloadBtn.textContent = original || t("ai.downloadCode");
          downloadBtn.classList.remove("ok");
        }, 1600);
      }
    } catch (error) {
      showError(error);
    }
    return;
  }
  const copyBtn = target.closest<HTMLButtonElement>(".ai-code-copy");
  if (copyBtn) {
    const raw = copyBtn.dataset.code ?? "";
    try {
      void copy(decodeURIComponent(raw));
      const original = copyBtn.textContent;
      copyBtn.textContent = t("ai.copied");
      copyBtn.classList.add("ok");
      window.setTimeout(() => {
        copyBtn.textContent = original || t("common.copy");
        copyBtn.classList.remove("ok");
      }, 1400);
    } catch {
      // 忽略解码失败
    }
    return;
  }
  const localImg = target.closest<HTMLImageElement>("img.ai-local-img");
  if (localImg) {
    const imgPath = localImg.dataset.localImagePath?.trim();
    if (imgPath) {
      event.preventDefault();
      emit("openFile", { path: imgPath });
    }
    return;
  }
  const fileLink = target.closest<HTMLAnchorElement>("a.ai-file-link");
  if (fileLink) {
    event.preventDefault();
    const filePath = fileLink.dataset.filePath?.trim();
    if (filePath) {
      const start = Number(fileLink.dataset.lineStart);
      const end = Number(fileLink.dataset.lineEnd);
      emit("openFile", {
        path: filePath,
        startLine: Number.isFinite(start) && start > 0 ? start : undefined,
        endLine: Number.isFinite(end) && end > 0 ? end : undefined,
      });
    }
    return;
  }
  const link = target.closest<HTMLAnchorElement>("a");
  if (link) {
    const href = link.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      event.preventDefault();
      openExternal(href);
    }
  }
}
</script>

<template>
  <article class="msg" :class="message.role">
    <!-- 用户消息：极简右对齐大圆角浅气泡，无头像 -->
    <div v-if="message.role === 'user'" class="user-wrap">
      <div class="user-col">
        <div class="user-bubble">
          <template v-if="editing">
            <textarea
              v-model="editText"
              class="edit-area"
              rows="3"
              @keydown.ctrl.enter.prevent="submitEdit"
              @keydown.esc.prevent="editing = false"
            />
            <div class="edit-actions">
              <button type="button" class="btn small subtle" @click="editing = false">{{ t("ai.cancel") }}</button>
              <button type="button" class="btn small primary" :disabled="!editText.trim()" @click="submitEdit">
                {{ t("ai.saveAndResend") }}
              </button>
            </div>
          </template>
          <template v-else>
            <div v-if="message.attachments?.length" class="user-attachments">
              <div v-for="att in message.attachments" :key="att.id" class="user-att" :class="att.kind">
                <img
                  v-if="att.kind === 'image' && (att.dataUrl || userImageUrls[att.id])"
                  :src="att.dataUrl || userImageUrls[att.id]"
                  :alt="att.name"
                  :title="att.filePath || att.name"
                  class="user-att-img"
                  :class="{ clickable: Boolean(att.filePath) }"
                  @click="att.filePath && emit('openFile', { path: att.filePath })"
                />
                <button
                  v-else-if="att.filePath && att.kind === 'text'"
                  type="button"
                  class="user-att-file clickable"
                  :title="att.filePath"
                  @click="emit('openFile', { path: att.filePath })"
                >
                  <FileText :size="13" />
                  <span>{{ att.name }}</span>
                </button>
                <span v-else class="user-att-file" :title="att.filePath || att.name">
                  <FileText :size="13" />
                  <span>{{ att.name }}</span>
                </span>
              </div>
            </div>
            <div v-if="message.content" class="user-text">{{ message.content }}</div>
          </template>
        </div>

        <div v-if="!editing && !streaming" class="msg-actions user-actions">
          <button
            v-if="message.content"
            type="button"
            class="quiet-btn"
            :class="{ ok: copied }"
            :title="copied ? t('ai.copied') : t('ai.copyMessage')"
            @click="copyMessage"
          >
            <Check v-if="copied" :size="13" />
            <Copy v-else :size="13" />
          </button>
          <button type="button" class="quiet-btn" :title="t('ai.editMessage')" @click="startEdit">
            <Pencil :size="13" />
          </button>
          <button type="button" class="quiet-btn" :title="t('ai.deleteMessage')" @click="emit('delete', message.id)">
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
    </div>

    <!-- 助手消息：无头像全宽文档流排版；连续思考与工具调用归入可折叠过程组，与正文交错呈现 -->
    <div v-else ref="assistantRef" class="assistant-wrap">
      <template v-for="(block, blockIdx) in displayBlocks" :key="block.id">
        <!-- 正文 Markdown 段 -->
        <div
          v-if="block.kind === 'text'"
          class="ai-md"
          v-html="renderText(block.text)"
          @click="onMarkdownClick"
        />

        <!-- 只有单段思考时直接一层折叠，避免多余套壳 -->
        <div v-else-if="isSingleReasoning(block)" class="reasoning-block">
          <button
            type="button"
            class="inline-disclosure"
            :aria-expanded="Boolean(expandedReasoning[block.items[0].id])"
            @click="toggleReasoning(block.items[0].id)"
          >
            <LoaderCircle v-if="isBlockStreaming(blockIdx)" :size="13" class="spin" />
            <span>{{ isBlockStreaming(blockIdx) ? t("ai.thinkingInProgress") : t("ai.thinking") }}</span>
            <ChevronRight :size="13" class="chevron" :class="{ open: Boolean(expandedReasoning[block.items[0].id]) }" />
          </button>
          <div class="fold-panel" :class="{ open: Boolean(expandedReasoning[block.items[0].id]) }">
            <div class="fold-inner">
              <div class="reasoning-content">{{ (block.items[0] as Extract<ChatMessagePart, { type: "reasoning" }>).text }}</div>
            </div>
          </div>
        </div>

        <!-- 思考 + 工具调用外层总折叠分组 -->
        <div v-else class="process-group">
          <button
            type="button"
            class="inline-disclosure process-toggle"
            :class="{ error: processHasError(block) }"
            :aria-expanded="Boolean(expandedGroups[block.id])"
            @click="toggleGroup(block.id)"
          >
            <LoaderCircle v-if="isBlockStreaming(blockIdx)" :size="13" class="spin status-running" />
            <span>{{ processSummary(block, blockIdx) }}</span>
            <ChevronRight :size="13" class="chevron" :class="{ open: Boolean(expandedGroups[block.id]) }" />
          </button>

          <div class="fold-panel" :class="{ open: Boolean(expandedGroups[block.id]) }">
            <div class="fold-inner">
              <div class="process-steps">
                <template v-for="(item, itemIdx) in block.items" :key="item.id">
                  <!-- 子项：思考过程 -->
                  <div v-if="item.type === 'reasoning'" class="reasoning-block">
                    <button
                      type="button"
                      class="inline-disclosure"
                      :aria-expanded="Boolean(expandedReasoning[item.id])"
                      @click="toggleReasoning(item.id)"
                    >
                      <LoaderCircle v-if="isReasoningItemStreaming(blockIdx, itemIdx, block.items.length)" :size="13" class="spin" />
                      <span>{{ isReasoningItemStreaming(blockIdx, itemIdx, block.items.length) ? t("ai.thinkingInProgress") : t("ai.thinking") }}</span>
                      <ChevronRight :size="13" class="chevron" :class="{ open: Boolean(expandedReasoning[item.id]) }" />
                    </button>
                    <div class="fold-panel" :class="{ open: Boolean(expandedReasoning[item.id]) }">
                      <div class="fold-inner">
                        <div class="reasoning-content">{{ item.text }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- 子项：工具调用 -->
                  <AiToolCallItem v-else :call="item.call" />
                </template>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-if="streaming && !displayBlocks.length" class="typing-dots" aria-hidden="true">
        <span /><span /><span />
      </div>

      <div v-if="message.error" class="error-banner">
        <CircleAlert :size="15" />
        <span>{{ message.error }}</span>
        <button type="button" class="btn small" @click="emit('regenerate', message.id)">
          <RotateCw :size="12" />{{ t("ai.regenerate") }}
        </button>
      </div>

      <!-- 底部极简操作与轻量元信息（类似参考图底栏） -->
      <footer v-if="!streaming" class="assistant-foot">
        <div class="msg-actions">
          <button
            v-if="message.content"
            type="button"
            class="quiet-btn"
            :class="{ ok: copied }"
            :title="copied ? t('ai.copied') : t('ai.copyMessage')"
            @click="copyMessage"
          >
            <Check v-if="copied" :size="13" />
            <Copy v-else :size="13" />
          </button>
          <button type="button" class="quiet-btn" :title="t('ai.regenerate')" @click="emit('regenerate', message.id)">
            <RotateCw :size="13" />
          </button>
          <button type="button" class="quiet-btn" :title="t('ai.deleteMessage')" @click="emit('delete', message.id)">
            <Trash2 :size="13" />
          </button>
        </div>

        <span v-if="message.modelName || message.modelId" class="foot-meta">
          {{ message.providerName ? `${message.providerName} · ${message.modelName || message.modelId}` : (message.modelName || message.modelId) }}
        </span>
        <span v-if="durationLabel" class="foot-meta">{{ durationLabel }}</span>
        <span v-if="message.aborted" class="foot-meta">{{ t("ai.stopped") }}</span>
      </footer>
    </div>
  </article>
</template>

<style scoped>
.msg {
  width: 100%;
}

/* ---------- 用户消息：柔和纯净大圆角气泡 ---------- */
.user-wrap {
  display: flex;
  justify-content: flex-end;
}
.user-col {
  max-width: min(78%, 620px);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.user-bubble {
  padding: 12px 18px;
  border-radius: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.user-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.user-att-img {
  max-width: 220px;
  max-height: 160px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid var(--border);
}
.user-att-img.clickable {
  cursor: zoom-in;
}
.user-att-file {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}
.user-att-file.clickable {
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.user-att-file.clickable:hover {
  border-color: var(--accent);
  color: var(--text);
}
.user-text {
  font-size: 14.5px;
  line-height: 1.68;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}
.user-actions {
  padding-right: 4px;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.user-wrap:hover .user-actions,
.user-wrap:focus-within .user-actions {
  opacity: 1;
}

.edit-area {
  width: min(520px, 60vw);
  min-width: 240px;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}
.edit-area:focus {
  border-color: var(--accent);
}
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

/* ---------- 助手消息：极简全宽文档流 ---------- */
.assistant-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 2px;
}

.inline-disclosure {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--text-3);
  font-size: 13px;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}
.inline-disclosure:hover {
  color: var(--text-2);
}
.chevron {
  transition: transform var(--dur) var(--ease-out);
}
.chevron.open {
  transform: rotate(90deg);
}

.fold-panel {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows var(--dur) var(--ease-out), opacity var(--dur) var(--ease-out);
}
.fold-panel.open {
  grid-template-rows: 1fr;
  opacity: 1;
}
.fold-inner {
  min-height: 0;
  overflow: hidden;
}

/* 外层过程总折叠分组 */
.process-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.process-group > .fold-panel {
  width: 100%;
}
.process-toggle {
  font-size: 13px;
  color: var(--text-3);
}
.process-toggle.error {
  color: var(--danger);
}
.process-steps {
  margin-top: 4px;
  margin-left: 5px;
  padding-left: 14px;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reasoning-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.reasoning-block .fold-panel {
  width: 100%;
}
.reasoning-content {
  margin-top: 4px;
  padding: 2px 6px 2px 14px;
  border-left: 2px solid var(--border);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-3);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.status-running {
  color: var(--accent);
  flex-shrink: 0;
}

.assistant-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
}
.foot-meta {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.msg-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.quiet-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
  display: inline-grid;
  place-items: center;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.quiet-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.quiet-btn.ok {
  color: var(--success);
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--danger);
  border-radius: 10px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
}
.error-banner span {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.typing-dots {
  display: inline-flex;
  gap: 5px;
  padding: 8px 2px;
}
.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-3);
  animation: ai-dot 1.2s ease-in-out infinite;
}
.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes ai-dot {
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
  40% { opacity: 1; transform: scale(1); }
}

/* ---------- 极简文档感 Markdown 排版 ---------- */
.ai-md {
  color: var(--text);
  font-size: 14.5px;
  line-height: 1.78;
  word-break: break-word;
  user-select: text;
}
.ai-md :deep(> :first-child) { margin-top: 0; }
.ai-md :deep(> :last-child) { margin-bottom: 0; }
.ai-md :deep(p),
.ai-md :deep(ul),
.ai-md :deep(ol),
.ai-md :deep(blockquote),
.ai-md :deep(table),
.ai-md :deep(.ai-code-block) {
  margin: 0 0 0.9em;
}
.ai-md :deep(h1),
.ai-md :deep(h2),
.ai-md :deep(h3),
.ai-md :deep(h4) {
  margin: 1.3em 0 0.5em;
  font-weight: 600;
  line-height: 1.35;
}
.ai-md :deep(h1) { font-size: 1.4em; }
.ai-md :deep(h2) { font-size: 1.22em; }
.ai-md :deep(h3) { font-size: 1.08em; }
.ai-md :deep(a) {
  color: var(--accent);
  text-decoration: none;
}
.ai-md :deep(a:hover) {
  text-decoration: underline;
}
.ai-md :deep(ul),
.ai-md :deep(ol) {
  padding-left: 1.55em;
}
.ai-md :deep(li + li) {
  margin-top: 0.3em;
}
.ai-md :deep(blockquote) {
  padding: 0.15em 0.95em;
  border-left: 2px solid var(--border-strong);
  color: var(--text-2);
}
.ai-md :deep(hr) {
  height: 1px;
  border: 0;
  background: var(--border);
  margin: 1.3em 0;
}
.ai-md :deep(table) {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 13px;
}
.ai-md :deep(th),
.ai-md :deep(td) {
  padding: 6px 12px;
  border: 1px solid var(--border);
}
.ai-md :deep(th) {
  background: var(--bg-sunken);
  font-weight: 600;
}
.ai-md :deep(a.ai-file-link) {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.ai-md :deep(a.ai-file-link:hover) {
  border-bottom-color: var(--accent);
}
.ai-md :deep(img.ai-local-img) {
  display: block;
  max-width: min(100%, 460px);
  max-height: 360px;
  width: auto;
  height: auto;
  margin: 0.55em 0;
  border-radius: 10px;
  border: 1px solid var(--border);
  background-color: var(--bg-sunken);
  background-image:
    linear-gradient(45deg, var(--border) 25%, transparent 25%),
    linear-gradient(-45deg, var(--border) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--border) 75%),
    linear-gradient(-45deg, transparent 75%, var(--border) 75%);
  background-size: 14px 14px;
  background-position: 0 0, 0 7px, 7px -7px, -7px 0;
  cursor: zoom-in;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.ai-md :deep(img.ai-local-img:hover) {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}
.ai-md :deep(code) {
  padding: 0.12em 0.42em;
  border-radius: 5px;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 0.85em;
}
.ai-md :deep(.ai-code-block) {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}
.ai-md :deep(.ai-code-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px 7px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}
.ai-md :deep(.ai-code-lang) {
  font-size: 11.5px;
  color: var(--text-3);
  font-family: var(--font-mono);
}
.ai-md :deep(.ai-code-actions) {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ai-md :deep(.ai-code-btn) {
  height: 22px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-3);
  font-size: 11.5px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.ai-md :deep(.ai-code-btn:hover) {
  background: var(--hover);
  color: var(--text);
}
.ai-md :deep(.ai-code-btn.ok) {
  color: var(--success);
}
.ai-md :deep(pre) {
  margin: 0;
  padding: 13px 16px;
  overflow-x: auto;
  line-height: 1.65;
}
.ai-md :deep(pre code) {
  padding: 0;
  border: 0;
  background: none;
  font-size: 13px;
  white-space: pre;
}
.ai-md :deep(.hljs-comment),
.ai-md :deep(.hljs-quote) { color: var(--text-3); font-style: italic; }
.ai-md :deep(.hljs-keyword),
.ai-md :deep(.hljs-selector-tag),
.ai-md :deep(.hljs-built_in) { color: var(--syntax-literal); }
.ai-md :deep(.hljs-string),
.ai-md :deep(.hljs-regexp),
.ai-md :deep(.hljs-addition) { color: var(--syntax-string); }
.ai-md :deep(.hljs-number),
.ai-md :deep(.hljs-literal),
.ai-md :deep(.hljs-bullet) { color: var(--syntax-number); }
.ai-md :deep(.hljs-title),
.ai-md :deep(.hljs-section),
.ai-md :deep(.hljs-attr),
.ai-md :deep(.hljs-attribute),
.ai-md :deep(.hljs-property),
.ai-md :deep(.hljs-name) { color: var(--syntax-key); }
.ai-md :deep(.hljs-deletion) { color: var(--danger); }
</style>
