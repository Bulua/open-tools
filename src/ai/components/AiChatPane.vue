<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowDown, Settings, Sparkles } from "lucide-vue-next";
import { showError } from "@/utils/errorToast";
import {
  isImageFilePath,
  readLocalFileForPreview,
  readLocalImageForPreview,
  resolveConversationWorkspaceDir,
} from "../builtinTools";
import type { ParsedFileLink } from "../markdown";
import {
  createImageOutputFile,
  createOutputFileFromSnapshot,
  extractConversationOutputs,
  type AiOutputFile,
} from "../outputs";
import { buildTimelineItems } from "../timeline";
import type {
  ChatAttachment,
  Conversation,
  ExecutionPolicy,
  ModelOption,
  PendingToolApproval,
  ThinkingEffort,
  ToolApprovalDecision,
} from "@/types/ai";
import type { SettingsTab } from "./AiSettingsModal.vue";
import AiApprovalCard from "./AiApprovalCard.vue";
import AiChatComposer from "./AiChatComposer.vue";
import AiMessageItem from "./AiMessageItem.vue";
import AiMessageTimeline from "./AiMessageTimeline.vue";
import AiOutputsPane from "./AiOutputsPane.vue";

const props = defineProps<{
  conversation: Conversation | null;
  availableModels: ModelOption[];
  selectedModelConfigId: string;
  workspaceDir?: string;
  executionPolicy?: ExecutionPolicy;
  pendingApproval?: PendingToolApproval | null;
  streaming: boolean;
}>();

const emit = defineEmits<{
  send: [text: string, attachments: ChatAttachment[]];
  stop: [];
  selectModel: [modelConfigId: string, effort?: ThinkingEffort];
  updateWorkspace: [dir: string];
  updateExecutionPolicy: [policy: ExecutionPolicy];
  approveTool: [conversationId: string, decision: ToolApprovalDecision];
  regenerate: [messageId: string];
  editMessage: [messageId: string, content: string];
  deleteMessage: [messageId: string];
  openSettings: [tab?: SettingsTab];
}>();

const { t } = useI18n();
const scrollRef = ref<HTMLElement>();
const composerRef = ref<InstanceType<typeof AiChatComposer>>();
const stickToBottom = ref(true);

const messages = computed(() => props.conversation?.messages ?? []);
const timelineItems = computed(() => buildTimelineItems(messages.value, t("ai.timelineAttachmentOnly")));
const outputFiles = computed(() => extractConversationOutputs(messages.value));
const outputsOpen = ref(false);
const selectedOutputId = ref("");
const externalOutputFile = ref<AiOutputFile | null>(null);
const highlightLines = ref<{ start: number; end?: number } | null>(null);
const outputsPanelWidth = ref(280);
const outputsResizing = ref(false);

const activeTimelineId = ref("");
const highlightedMessageId = ref("");
let highlightTimer = 0;
let scrollSyncRaf = 0;
let jumpLockUntil = 0;
const chatTitle = computed(() => props.conversation?.title || t("ai.newChat"));

function toggleOutputs() {
  outputsOpen.value = !outputsOpen.value;
  if (!outputsOpen.value) {
    selectedOutputId.value = "";
    externalOutputFile.value = null;
    highlightLines.value = null;
  }
}

function selectOutputFile(fileId: string) {
  selectedOutputId.value = fileId;
  externalOutputFile.value = null;
  highlightLines.value = null;
  if (fileId) outputsOpen.value = true;
}

function closeOutputs() {
  outputsOpen.value = false;
  selectedOutputId.value = "";
  externalOutputFile.value = null;
  highlightLines.value = null;
  outputsResizing.value = false;
}

function normalizeLookupPath(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

async function openReferencedFile(ref: ParsedFileLink) {
  const targetNorm = normalizeLookupPath(ref.path);
  const nextRange = ref.startLine ? { start: ref.startLine, end: ref.endLine } : null;

  // 1. 优先命中当前会话输出列表里已记录的文件
  const matched = outputFiles.value.find((item) => {
    const itemNorm = normalizeLookupPath(item.filePath);
    return itemNorm === targetNorm || itemNorm.endsWith(`/${targetNorm}`) || targetNorm.endsWith(`/${itemNorm}`);
  });
  if (matched) {
    externalOutputFile.value = null;
    selectedOutputId.value = matched.id;
    highlightLines.value = nextRange;
    outputsOpen.value = true;
    return;
  }

  // 2. 未在输出列表中的本地文件，按图片/文本类型分别读取并在右侧查看
  try {
    const wsDir = await resolveConversationWorkspaceDir(props.conversation?.id || "draft", props.workspaceDir);
    let file: AiOutputFile | null;
    if (isImageFilePath(ref.path)) {
      const loaded = await readLocalImageForPreview(wsDir, ref.path);
      file = createImageOutputFile(loaded);
    } else {
      const loaded = await readLocalFileForPreview(wsDir, ref.path);
      file = createOutputFileFromSnapshot(loaded.path, loaded.content);
    }
    if (!file) return;
    selectedOutputId.value = "";
    externalOutputFile.value = file;
    highlightLines.value = file.previewKind === "image" ? null : nextRange;
    outputsOpen.value = true;
  } catch (error) {
    showError(error);
  }
}

function syncActiveTimelineItem() {
  const items = timelineItems.value;
  if (!items.length) {
    activeTimelineId.value = "";
    return;
  }
  if (performance.now() < jumpLockUntil && items.some((item) => item.id === activeTimelineId.value)) {
    return;
  }
  const el = scrollRef.value;
  if (!el || el.scrollHeight - el.scrollTop - el.clientHeight < 32) {
    activeTimelineId.value = items[items.length - 1].id;
    return;
  }
  const nodeById = new Map<string, HTMLElement>();
  for (const node of el.querySelectorAll<HTMLElement>("[data-message-id]")) {
    if (node.dataset.messageId) nodeById.set(node.dataset.messageId, node);
  }
  const anchorY = el.getBoundingClientRect().top + 96;
  let current = items[0].id;
  for (const item of items) {
    const node = nodeById.get(item.id);
    if (!node) continue;
    if (node.getBoundingClientRect().top <= anchorY) {
      current = item.id;
    } else {
      break;
    }
  }
  activeTimelineId.value = current;
}

function scheduleTimelineSync() {
  if (scrollSyncRaf) return;
  scrollSyncRaf = window.requestAnimationFrame(() => {
    scrollSyncRaf = 0;
    syncActiveTimelineItem();
  });
}

function jumpToMessage(messageId: string) {
  const el = scrollRef.value;
  if (!el) return;
  const target = Array.from(el.querySelectorAll<HTMLElement>("[data-message-id]")).find(
    (node) => node.dataset.messageId === messageId,
  );
  if (!target) return;

  stickToBottom.value = false;
  activeTimelineId.value = messageId;
  jumpLockUntil = performance.now() + 500;

  const top = Math.max(0, el.scrollTop + target.getBoundingClientRect().top - el.getBoundingClientRect().top - 16);
  const reduceMotion =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof el.scrollTo === "function") {
    el.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  } else {
    el.scrollTop = top;
  }

  highlightedMessageId.value = messageId;
  window.clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => {
    if (highlightedMessageId.value === messageId) highlightedMessageId.value = "";
  }, 950);
}

function scrollToBottom(smooth = false) {
  const el = scrollRef.value;
  if (!el) return;
  stickToBottom.value = true;
  jumpLockUntil = 0;
  if (typeof el.scrollTo === "function") {
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  } else {
    el.scrollTop = el.scrollHeight;
  }
  if (timelineItems.value.length) {
    activeTimelineId.value = timelineItems.value[timelineItems.value.length - 1].id;
  }
}

function onScroll() {
  const el = scrollRef.value;
  if (!el) return;
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
  scheduleTimelineSync();
}

watch(
  () => props.conversation?.id,
  () => {
    stickToBottom.value = true;
    jumpLockUntil = 0;
    highlightedMessageId.value = "";
    selectedOutputId.value = "";
    externalOutputFile.value = null;
    highlightLines.value = null;
    nextTick(() => {
      scrollToBottom(false);
      syncActiveTimelineItem();
    });
  },
);

watch(
  () => outputFiles.value.map((item) => item.id).join(","),
  () => {
    if (selectedOutputId.value && !outputFiles.value.some((item) => item.id === selectedOutputId.value)) {
      selectedOutputId.value = "";
    }
  },
);

watch(
  () => timelineItems.value.map((item) => item.id).join(","),
  () => {
    nextTick(syncActiveTimelineItem);
  },
  { immediate: true },
);

watch(
  () => {
    const last = messages.value[messages.value.length - 1];
    return `${messages.value.length}:${last?.content.length ?? 0}:${last?.reasoning?.length ?? 0}:${last?.parts?.length ?? 0}`;
  },
  () => {
    if (stickToBottom.value) nextTick(() => scrollToBottom(false));
  },
);

onBeforeUnmount(() => {
  window.clearTimeout(highlightTimer);
  if (scrollSyncRaf) window.cancelAnimationFrame(scrollSyncRaf);
});

function focusInput() {
  composerRef.value?.focusInput();
}

defineExpose({ focusInput });
</script>

<template>
  <section class="chat-pane">
    <header class="chat-header">
      <h2 class="chat-heading" :title="chatTitle">{{ chatTitle }}</h2>

      <div class="header-controls">
        <button
          type="button"
          class="icon-btn outputs-toggle-btn"
          :class="{ active: outputsOpen }"
          :title="t('ai.outputs.toggle')"
          :aria-label="t('ai.outputs.toggle')"
          :aria-expanded="outputsOpen"
          @click="toggleOutputs"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="5.5" cy="8" r="2.2" />
            <line x1="11" y1="8" x2="20" y2="8" />
            <circle cx="5.5" cy="16" r="2.2" />
            <line x1="11" y1="16" x2="20" y2="16" />
          </svg>
          <span v-if="outputFiles.length" class="outputs-badge">{{ outputFiles.length }}</span>
        </button>
      </div>
    </header>

    <div
      class="chat-main-row"
      :class="{ 'is-outputs-resizing': outputsResizing }"
      :style="{ '--outputs-shift': outputsOpen ? `${outputsPanelWidth + 22}px` : '0px' }"
    >
      <div class="chat-conversation-col">
        <div class="chat-body">
          <AiMessageTimeline
            v-if="timelineItems.length"
            :items="timelineItems"
            :active-id="activeTimelineId"
            @jump="jumpToMessage"
          />

          <div ref="scrollRef" class="message-scroll" :class="{ 'has-timeline': timelineItems.length > 0 }" @scroll="onScroll">
            <div class="message-scroll-inner">
              <div v-if="messages.length" class="message-list">
                <AiMessageItem
                  v-for="(msg, index) in messages"
                  :key="msg.id"
                  :data-message-id="msg.id"
                  :class="{ 'is-jump-target': highlightedMessageId === msg.id }"
                  :message="msg"
                  :streaming="streaming && index === messages.length - 1 && msg.role === 'assistant'"
                  :conversation-id="props.conversation?.id"
                  :workspace-dir="props.workspaceDir"
                  @regenerate="emit('regenerate', $event)"
                  @edit="(id, content) => emit('editMessage', id, content)"
                  @delete="emit('deleteMessage', $event)"
                  @open-file="openReferencedFile"
                />
              </div>

              <div v-else class="welcome-state">
                <span class="welcome-icon"><Sparkles :size="24" :stroke-width="1.7" /></span>
                <h3>{{ t("ai.welcomeTitle") }}</h3>
                <p>{{ availableModels.length ? t("ai.welcomeConfigured") : t("ai.welcomeUnconfigured") }}</p>
                <button v-if="!availableModels.length" type="button" class="btn primary" @click="emit('openSettings', 'models')">
                  <Settings :size="14" />
                  <span>{{ t("ai.openSettings") }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="composer-wrap">
          <div class="composer-box">
            <button
              v-if="!stickToBottom && messages.length"
              type="button"
              class="scroll-bottom-btn"
              :aria-label="t('ai.send')"
              @click="scrollToBottom(true)"
            >
              <ArrowDown :size="15" />
            </button>

            <Transition name="pop">
              <AiApprovalCard
                v-if="pendingApproval"
                :approval="pendingApproval"
                @decide="(convId, decision) => emit('approveTool', convId, decision)"
              />
            </Transition>

            <AiChatComposer
              ref="composerRef"
              :available-models="availableModels"
              :selected-model-config-id="selectedModelConfigId"
              :workspace-dir="workspaceDir"
              :execution-policy="executionPolicy"
              :streaming="streaming"
              @before-submit="stickToBottom = true"
              @send="(text, attachments) => emit('send', text, attachments)"
              @stop="emit('stop')"
              @select-model="(id, effort) => emit('selectModel', id, effort)"
              @update-workspace="emit('updateWorkspace', $event)"
              @update-execution-policy="emit('updateExecutionPolicy', $event)"
              @open-settings="emit('openSettings', $event)"
            />
          </div>
        </div>
      </div>

      <Transition name="output-drawer">
        <AiOutputsPane
          v-if="outputsOpen"
          :files="outputFiles"
          :selected-id="selectedOutputId"
          :external-file="externalOutputFile"
          :highlight-lines="highlightLines"
          :conversation-id="props.conversation?.id"
          :workspace-dir="props.workspaceDir"
          @select="selectOutputFile"
          @open-file="openReferencedFile"
          @jump-to-message="jumpToMessage"
          @width-change="outputsPanelWidth = $event"
          @resizing-change="outputsResizing = $event"
          @close="closeOutputs"
        />
      </Transition>
    </div>
  </section>
</template>

<style scoped>
.chat-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.chat-header {
  flex-shrink: 0;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 20px;
  background: var(--bg);
}

.chat-heading {
  margin: 0;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.header-controls .icon-btn.active {
  background: var(--active);
  color: var(--text);
}
.outputs-toggle-btn {
  position: relative;
  border-radius: 999px;
}
.outputs-badge {
  position: absolute;
  top: -2px;
  right: -3px;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.chat-main-row {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* 右侧输出面板滑入/滑出，会话滚动条始终贴最右边缘不动 */
.output-drawer-enter-active {
  transition: transform var(--dur-slow) var(--ease-out), opacity var(--dur) var(--ease-out);
}
.output-drawer-leave-active {
  transition: transform var(--dur) ease-in, opacity var(--dur-fast) ease-in;
  pointer-events: none;
}
.output-drawer-enter-from,
.output-drawer-leave-to {
  transform: translateX(calc(100% + 16px));
  opacity: 0;
}

.chat-conversation-col {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.message-scroll {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px 24px;
  scrollbar-width: thin;
}
.message-scroll.has-timeline {
  padding-left: 36px;
  padding-right: 36px;
}

.message-scroll-inner {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding-right: var(--outputs-shift, 0px);
  transition: padding-right var(--dur-slow) var(--ease-out);
}
.chat-main-row.is-outputs-resizing .message-scroll-inner,
.chat-main-row.is-outputs-resizing .composer-wrap {
  transition: none;
}

.message-list {
  width: 100%;
  max-width: 780px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.message-list :deep(.msg .user-bubble),
.message-list :deep(.msg .assistant-wrap) {
  border-radius: 14px;
  transition: border-color var(--dur-slow) var(--ease-out), box-shadow var(--dur-slow) var(--ease-out), background var(--dur-slow) var(--ease-out);
}
.message-list :deep(.msg.is-jump-target .user-bubble) {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-sm);
}
.message-list :deep(.msg.is-jump-target .assistant-wrap) {
  background: var(--accent-soft);
  box-shadow: 0 0 0 6px var(--accent-soft);
}

.welcome-state {
  flex: 1;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  padding: 24px;
}
.welcome-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
}
.welcome-state h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  color: var(--text);
}
.welcome-state p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text-2);
}

.composer-wrap {
  position: relative;
  flex-shrink: 0;
  padding: 8px calc(20px + var(--outputs-shift, 0px)) 18px 20px;
  transition: padding-right var(--dur-slow) var(--ease-out);
}
.composer-box {
  position: relative;
  max-width: 780px;
  margin: 0 auto;
}

.scroll-bottom-btn {
  position: absolute;
  top: -44px;
  left: 50%;
  transform: translateX(-50%);
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow);
  cursor: pointer;
}
.scroll-bottom-btn:hover {
  color: var(--text);
}
</style>
