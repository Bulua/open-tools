<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  FilePenLine,
  FileText,
  FolderOpen,
  Info,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Wrench,
  X,
} from "lucide-vue-next";
import { usePopover } from "@/composables/usePopover";
import { showError } from "@/utils/errorToast";
import {
  pickWorkspaceFolder,
  readLocalFileForPreview,
  resolveConversationWorkspaceDir,
} from "../builtinTools";
import type { ParsedFileLink } from "../markdown";
import { makeEntityId } from "../presets";
import { createOutputFileFromSnapshot, extractConversationOutputs, type AiOutputFile } from "../outputs";
import { buildTimelineItems } from "../timeline";
import type {
  ChatAttachment,
  Conversation,
  ExecutionPolicy,
  ModelOption,
  PendingToolApproval,
  ThinkingEffort,
  ToolApprovalDecision,
} from "../types";
import type { SettingsTab } from "./AiSettingsModal.vue";
import AiMessageItem from "./AiMessageItem.vue";
import AiMessageTimeline from "./AiMessageTimeline.vue";
import AiModelPicker from "./AiModelPicker.vue";
import AiOutputsPane from "./AiOutputsPane.vue";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 100_000;

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
const input = ref("");
const pendingFiles = ref<ChatAttachment[]>([]);
const dragging = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const textareaRef = ref<HTMLTextAreaElement>();
const scrollRef = ref<HTMLElement>();
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

  // 2. 未在输出列表中的本地文件，直接通过工作区工具读取后在右侧查看
  try {
    const wsDir = await resolveConversationWorkspaceDir(props.conversation?.id || "draft", props.workspaceDir);
    const loaded = await readLocalFileForPreview(wsDir, ref.path);
    const file = createOutputFileFromSnapshot(loaded.path, loaded.content);
    if (!file) return;
    selectedOutputId.value = "";
    externalOutputFile.value = file;
    highlightLines.value = nextRange;
    outputsOpen.value = true;
  } catch (error) {
    showError(error);
  }
}
const canSend = computed(
  () =>
    !props.streaming &&
    (input.value.trim().length > 0 || pendingFiles.value.length > 0) &&
    props.availableModels.length > 0,
);
const sendHint = computed(() => t("ai.sendHintEnter"));

const policyBtn = ref<HTMLElement>();
const policyPanel = ref<HTMLElement>();
const {
  open: policyOpen,
  style: policyStyle,
  toggle: togglePolicy,
  close: closePolicy,
} = usePopover(policyBtn, policyPanel, { minWidth: 288, maxHeight: 240, align: "right", gap: 6 });

const activePolicy = computed<ExecutionPolicy>(() => props.executionPolicy ?? "review");

function formatShellBadge(shell?: string): string {
  const normalized = (shell || "powershell").trim().toLowerCase();
  if (normalized === "cmd") return "CMD";
  if (normalized === "powershell") return "PowerShell";
  return shell || "PowerShell";
}

function selectPolicy(policy: ExecutionPolicy) {
  emit("updateExecutionPolicy", policy);
  closePolicy();
}

const workspaceLabel = computed(() => {
  const dir = (props.workspaceDir ?? "").trim();
  if (!dir) return t("ai.workspace.defaultLabel");
  const normalized = dir.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
});

async function onPickWorkspace() {
  try {
    const picked = await pickWorkspaceFolder(props.workspaceDir);
    if (picked) emit("updateWorkspace", picked);
  } catch (error) {
    showError(error);
  }
}

function onResetWorkspace() {
  emit("updateWorkspace", "");
}

function resizeTextarea() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
}

watch(input, () => nextTick(resizeTextarea));

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
    return `${messages.value.length}:${last?.content.length ?? 0}:${last?.reasoning?.length ?? 0}:${last?.toolCalls?.length ?? 0}`;
  },
  () => {
    if (stickToBottom.value) nextTick(() => scrollToBottom(false));
  },
);

onBeforeUnmount(() => {
  window.clearTimeout(highlightTimer);
  if (scrollSyncRaf) window.cancelAnimationFrame(scrollSyncRaf);
});

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function looksBinary(text: string): boolean {
  const limit = Math.min(text.length, 2048);
  let bad = 0;
  for (let i = 0; i < limit; i++) {
    const code = text.charCodeAt(i);
    if (code === 0) return true;
    if (code < 9 || (code > 13 && code < 32)) bad++;
  }
  return limit > 0 && bad / limit > 0.1;
}

async function addFiles(fileList: FileList | File[]) {
  for (const file of Array.from(fileList)) {
    const mime = file.type || "";
    const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
    try {
      if (isImage) {
        if (file.size > MAX_IMAGE_BYTES) {
          showError(t("ai.errors.fileTooLarge", { name: file.name, limit: "10 MB" }));
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        pendingFiles.value.push({
          id: makeEntityId("att"),
          name: file.name || t("common.pastedImage"),
          mimeType: mime || "image/png",
          size: file.size,
          kind: "image",
          dataUrl,
        });
      } else {
        if (file.size > MAX_TEXT_BYTES) {
          showError(t("ai.errors.fileTooLarge", { name: file.name, limit: "2 MB" }));
          continue;
        }
        const rawText = await readFileAsText(file);
        if (looksBinary(rawText)) {
          showError(t("ai.errors.unsupportedBinaryFile", { name: file.name }));
          continue;
        }
        const textContent = rawText.length > MAX_TEXT_CHARS
          ? `${rawText.slice(0, MAX_TEXT_CHARS)}\n…`
          : rawText;
        pendingFiles.value.push({
          id: makeEntityId("att"),
          name: file.name,
          mimeType: mime || "text/plain",
          size: file.size,
          kind: "text",
          textContent,
        });
      }
    } catch (error) {
      showError(error);
    }
  }
}

function triggerFilePick() {
  fileInputRef.value?.click();
}

async function onFilePicked(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files?.length) {
    await addFiles(target.files);
  }
  target.value = "";
}

function removeAttachment(id: string) {
  pendingFiles.value = pendingFiles.value.filter((item) => item.id !== id);
}

async function onPaste(event: ClipboardEvent) {
  const files = event.clipboardData?.files;
  if (files?.length) {
    event.preventDefault();
    await addFiles(files);
  }
}

async function onDrop(event: DragEvent) {
  dragging.value = false;
  const files = event.dataTransfer?.files;
  if (files?.length) {
    await addFiles(files);
  }
}

function submit() {
  if (!canSend.value) return;
  const text = input.value;
  const attachments = [...pendingFiles.value];
  input.value = "";
  pendingFiles.value = [];
  stickToBottom.value = true;
  nextTick(resizeTextarea);
  emit("send", text, attachments);
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    submit();
  }
}

function focusInput() {
  textareaRef.value?.focus();
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

            <!-- 执行命令或写入工作区外路径时的轻盈内联确认卡片（无深色实心按钮） -->
            <Transition name="pop">
              <div v-if="pendingApproval" class="approval-card" role="alertdialog" aria-live="polite">
                <div class="approval-head">
                  <span class="approval-icon" :class="pendingApproval.kind">
                    <Terminal v-if="pendingApproval.kind === 'command'" :size="15" :stroke-width="1.9" />
                    <Wrench v-else-if="pendingApproval.kind === 'tool'" :size="15" :stroke-width="1.9" />
                    <FilePenLine v-else :size="15" :stroke-width="1.9" />
                  </span>
                  <span class="approval-title">
                    {{
                      pendingApproval.kind === "command"
                        ? t("ai.approval.commandTitle")
                        : pendingApproval.kind === "tool"
                          ? t("ai.approval.toolTitle")
                          : t("ai.approval.externalWriteTitle")
                    }}
                  </span>
                  <span class="approval-badge">
                    {{
                      pendingApproval.kind === "command"
                        ? formatShellBadge(pendingApproval.shell)
                        : pendingApproval.toolName
                    }}
                  </span>
                </div>

                <div class="approval-detail">
                  <pre v-if="pendingApproval.kind === 'command'" class="approval-cmd">{{ pendingApproval.command }}</pre>
                  <pre v-if="pendingApproval.kind === 'tool' && pendingApproval.argumentsText" class="approval-cmd">{{ pendingApproval.argumentsText }}</pre>
                  <div v-if="pendingApproval.kind === 'command' && pendingApproval.cwd" class="approval-meta">
                    <FolderOpen :size="12" class="approval-meta-icon" />
                    <span class="approval-meta-label">{{ t("ai.approval.cwdLabel") }}</span>
                    <code class="approval-path" :title="pendingApproval.cwd">{{ pendingApproval.cwd }}</code>
                  </div>
                  <div v-if="pendingApproval.kind === 'externalWrite' && pendingApproval.targetPath" class="approval-meta single">
                    <FilePenLine :size="12" class="approval-meta-icon" />
                    <span class="approval-meta-label">{{ t("ai.approval.pathLabel") }}</span>
                    <code class="approval-path" :title="pendingApproval.targetPath">{{ pendingApproval.targetPath }}</code>
                  </div>
                </div>

                <div class="approval-actions">
                  <button
                    type="button"
                    class="approval-btn secondary"
                    @click="emit('approveTool', pendingApproval.conversationId, 'session')"
                  >
                    <ShieldCheck :size="13" />
                    <span>{{ t("ai.approval.allowSession") }}</span>
                  </button>
                  <div class="approval-actions-primary">
                    <button
                      type="button"
                      class="approval-btn deny"
                      @click="emit('approveTool', pendingApproval.conversationId, 'deny')"
                    >
                      <X :size="13" />
                      <span>{{ t("ai.approval.deny") }}</span>
                    </button>
                    <button
                      type="button"
                      class="approval-btn accept"
                      @click="emit('approveTool', pendingApproval.conversationId, 'once')"
                    >
                      <Check :size="13" />
                      <span>{{ t("ai.approval.allowOnce") }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </Transition>

            <div
              class="composer"
              :class="{ dragging }"
              @dragover.prevent="dragging = true"
              @dragleave.self="dragging = false"
              @drop.prevent="onDrop"
            >
            <!-- 待发送附件预览条：仅显示缩略图或文件图标，悬停右上角露出删除按钮 -->
            <div v-if="pendingFiles.length" class="attachment-strip">
              <div v-for="att in pendingFiles" :key="att.id" class="att-chip" :class="att.kind" :title="att.name">
                <img v-if="att.kind === 'image' && att.dataUrl" :src="att.dataUrl" :alt="att.name" class="att-thumb" />
                <FileText v-else :size="20" class="att-icon" />
                <button
                  type="button"
                  class="att-remove"
                  :title="t('files.remove')"
                  :aria-label="t('files.remove')"
                  @click="removeAttachment(att.id)"
                >
                  <X :size="11" />
                </button>
              </div>
            </div>

            <textarea
              ref="textareaRef"
              v-model="input"
              class="composer-input"
              rows="1"
              :placeholder="availableModels.length ? t('ai.inputPlaceholder') : t('ai.noModelsOption')"
              @keydown="onKeydown"
              @paste="onPaste"
            />

            <input
              ref="fileInputRef"
              type="file"
              class="hidden-file-input"
              multiple
              @change="onFilePicked"
            />

            <!-- 输入框底栏：左侧「+」上传文件与分组模型/思考等级选择器，右侧圆形发送/停止按钮 -->
            <div class="composer-foot">
              <div class="composer-left">
                <button
                  type="button"
                  class="attach-btn"
                  :title="t('ai.uploadFile')"
                  :aria-label="t('ai.uploadFile')"
                  @click="triggerFilePick"
                >
                  <Plus :size="16" />
                </button>

                <AiModelPicker
                  v-if="availableModels.length"
                  :models="availableModels"
                  :selected-id="selectedModelConfigId"
                  @select="(id, effort) => emit('selectModel', id, effort)"
                />
                <button
                  v-else
                  type="button"
                  class="configure-pill"
                  @click="emit('openSettings', 'models')"
                >
                  <Settings :size="13" />
                  <span>{{ t("ai.openSettings") }}</span>
                </button>

                <div class="workspace-group" :class="{ custom: Boolean(workspaceDir) }">
                  <button
                    type="button"
                    class="workspace-pill"
                    :title="workspaceDir || t('ai.workspace.pickTitle')"
                    :aria-label="t('ai.workspace.pickTitle')"
                    :disabled="streaming"
                    @click="onPickWorkspace"
                  >
                    <FolderOpen :size="13" />
                    <span class="workspace-label">{{ workspaceLabel }}</span>
                  </button>
                  <button
                    v-if="workspaceDir"
                    type="button"
                    class="workspace-reset"
                    :title="t('ai.workspace.resetTitle')"
                    :aria-label="t('ai.workspace.resetTitle')"
                    :disabled="streaming"
                    @click="onResetWorkspace"
                  >
                    <X :size="11" />
                  </button>
                </div>
              </div>

              <div class="composer-right">
                <button
                  ref="policyBtn"
                  type="button"
                  class="policy-trigger"
                  :class="{ open: policyOpen }"
                  :aria-expanded="policyOpen"
                  aria-haspopup="menu"
                  :title="activePolicy === 'auto' ? t('ai.executionPolicy.autoDesc') : t('ai.executionPolicy.reviewDesc')"
                  @click="togglePolicy"
                >
                  <ShieldAlert v-if="activePolicy === 'auto'" :size="13.5" :stroke-width="1.8" class="policy-icon" />
                  <Eye v-else :size="13.5" :stroke-width="1.8" class="policy-icon" />
                  <span>{{ activePolicy === "auto" ? t("ai.executionPolicy.autoLabel") : t("ai.executionPolicy.reviewLabel") }}</span>
                  <ChevronDown :size="12" class="policy-chevron" :class="{ open: policyOpen }" />
                </button>

                <Teleport to="body">
                  <Transition name="pop">
                    <div v-if="policyOpen" ref="policyPanel" class="policy-popover" :style="policyStyle" role="menu">
                      <div class="policy-menu-main">
                        <div class="policy-menu-head">
                          <span>{{ t("ai.executionPolicy.menuTitle") }}</span>
                          <span class="policy-info-icon" :title="t('ai.executionPolicy.menuTip')">
                            <Info :size="11.5" :stroke-width="1.8" />
                          </span>
                        </div>

                        <button
                          type="button"
                          role="menuitemradio"
                          class="policy-option"
                          :class="{ selected: activePolicy === 'review' }"
                          :aria-checked="activePolicy === 'review'"
                          @click="selectPolicy('review')"
                        >
                          <Eye :size="15" :stroke-width="1.75" class="policy-opt-icon" />
                          <span class="policy-opt-body">
                            <span class="policy-opt-title">
                              <span>{{ t("ai.executionPolicy.reviewLabel") }}</span>
                              <span class="policy-default-tag" :title="t('ai.executionPolicy.defaultTip')">
                                <span>{{ t("ai.executionPolicy.defaultBadge") }}</span>
                                <Info :size="10.5" :stroke-width="1.8" class="policy-tag-info" />
                              </span>
                            </span>
                            <span class="policy-opt-desc">{{ t("ai.executionPolicy.reviewDesc") }}</span>
                          </span>
                          <Check v-if="activePolicy === 'review'" :size="14" :stroke-width="1.9" class="policy-check" />
                        </button>

                        <button
                          type="button"
                          role="menuitemradio"
                          class="policy-option"
                          :class="{ selected: activePolicy === 'auto' }"
                          :aria-checked="activePolicy === 'auto'"
                          @click="selectPolicy('auto')"
                        >
                          <ShieldAlert :size="15" :stroke-width="1.75" class="policy-opt-icon" />
                          <span class="policy-opt-body">
                            <span class="policy-opt-title">{{ t("ai.executionPolicy.autoLabel") }}</span>
                            <span class="policy-opt-desc">{{ t("ai.executionPolicy.autoDesc") }}</span>
                          </span>
                          <Check v-if="activePolicy === 'auto'" :size="14" :stroke-width="1.9" class="policy-check" />
                        </button>
                      </div>

                      <div class="policy-menu-foot">
                        <Info :size="14" :stroke-width="1.75" class="policy-foot-icon" />
                        <span>{{ t("ai.executionPolicy.footerNote") }}</span>
                      </div>
                    </div>
                  </Transition>
                </Teleport>

                <button
                  v-if="streaming"
                  type="button"
                  class="circle-action stop-circle"
                  :title="t('ai.stop')"
                  :aria-label="t('ai.stop')"
                  @click="emit('stop')"
                >
                  <Square :size="12" fill="currentColor" />
                </button>
                <button
                  v-else
                  type="button"
                  class="circle-action send-circle"
                  :disabled="!canSend"
                  :title="sendHint"
                  :aria-label="t('ai.send')"
                  @click="submit"
                >
                  <ArrowUp :size="16" />
                </button>
              </div>
            </div>
          </div>
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
  color: #fff;
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

.approval-card {
  margin-bottom: 10px;
  padding: 14px 16px 13px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.approval-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.approval-icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
}
.approval-icon.externalWrite {
  background: var(--warning-soft);
  color: var(--warning);
}
.approval-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
}
.approval-badge {
  margin-left: auto;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-sunken);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
}
.approval-detail {
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--bg-sunken);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.approval-cmd {
  margin: 0;
  padding: 10px 13px;
  max-height: 136px;
  overflow: auto;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre;
  scrollbar-width: thin;
}
.approval-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-3);
  min-width: 0;
}
.approval-meta.single {
  border-top: 0;
  padding: 9px 12px;
}
.approval-meta-icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.approval-meta-label {
  flex-shrink: 0;
}
.approval-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-2);
}
.approval-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 1px;
}
.approval-actions-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.approval-btn {
  height: 31px;
  padding: 0 12px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.approval-btn.secondary {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
}
.approval-btn.secondary:hover {
  border-color: var(--border-strong);
  background: var(--hover);
  color: var(--text);
}
.approval-btn.deny {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
}
.approval-btn.deny:hover {
  border-color: var(--danger);
  background: var(--danger-soft);
  color: var(--danger);
}
.approval-btn.accept {
  border: 1px solid var(--accent-soft);
  background: var(--accent-soft);
  color: var(--accent);
}
.approval-btn.accept:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.scroll-bottom-btn {
  position: absolute;
  top: -44px;
  left: 50%;
  transform: translateX(-50%);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text-2);
  display: grid;
  place-items: center;
  box-shadow: var(--shadow);
  cursor: pointer;
}
.scroll-bottom-btn:hover {
  color: var(--text);
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 10px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: 0 0 0 4px var(--hover), var(--shadow-sm);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur) var(--ease-out);
}
.composer:focus-within,
.composer.dragging {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 4px var(--accent-soft), var(--shadow);
}

.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.att-chip {
  position: relative;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-sunken);
  flex-shrink: 0;
}
.att-thumb {
  width: 100%;
  height: 100%;
  border-radius: 9px;
  object-fit: cover;
  display: block;
}
.att-icon {
  color: var(--text-2);
}
.att-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-2);
  display: grid;
  place-items: center;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.att-chip:hover .att-remove,
.att-chip:focus-within .att-remove {
  opacity: 1;
  pointer-events: auto;
}
.att-remove:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

.composer-input {
  width: 100%;
  min-height: 26px;
  max-height: 180px;
  padding: 0 2px;
  border: 0;
  outline: none;
  resize: none;
  background: none;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 14.5px;
  line-height: 1.6;
}
.composer-input::placeholder {
  color: var(--text-3);
}

.hidden-file-input {
  display: none;
}

.composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.composer-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin-left: -4px;
}
.attach-btn {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-2);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.attach-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.configure-pill {
  height: 30px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.configure-pill:hover {
  background: var(--accent-soft);
}

.workspace-group {
  display: inline-flex;
  align-items: center;
  max-width: 200px;
  border-radius: 999px;
  transition: background var(--dur-fast) var(--ease-out);
}
.workspace-group.custom {
  background: var(--bg-sunken);
  border: 1px solid var(--border);
}
.workspace-pill {
  height: 28px;
  max-width: 176px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  font-size: 12px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.workspace-pill:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text);
}
.workspace-group.custom .workspace-pill {
  color: var(--text-2);
}
.workspace-pill:disabled,
.workspace-reset:disabled {
  opacity: 0.55;
  cursor: default;
}
.workspace-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-reset {
  width: 20px;
  height: 20px;
  margin-right: 4px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-3);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.workspace-reset:hover:not(:disabled) {
  background: var(--active);
  color: var(--text);
}

.composer-right {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.policy-trigger {
  height: 28px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 400;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.policy-trigger:hover {
  background: var(--hover);
  color: var(--text);
}
.policy-trigger.open {
  background: var(--active);
  color: var(--text);
}
.policy-icon {
  flex-shrink: 0;
  color: currentColor;
}
.policy-chevron {
  flex-shrink: 0;
  color: var(--text-3);
  transition: transform var(--dur-fast) var(--ease-out);
}
.policy-chevron.open {
  transform: rotate(180deg);
}
.circle-action {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.circle-action:active:not(:disabled) {
  transform: scale(0.95);
}
.send-circle {
  background: var(--accent);
  color: #fff;
}
.send-circle:hover:not(:disabled) {
  background: var(--accent-hover);
}
.send-circle:disabled {
  background: var(--active);
  color: var(--text-3);
  cursor: default;
}
.stop-circle {
  background: var(--active);
  color: var(--danger);
}
.stop-circle:hover {
  background: var(--danger-soft);
}
</style>

<style>
.policy-popover {
  position: fixed;
  z-index: 130;
  width: min(288px, calc(100vw - 24px));
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.policy-menu-main {
  padding: 8px 7px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.policy-menu-head {
  padding: 2px 8px 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-2);
}

.policy-info-icon {
  display: inline-flex;
  align-items: center;
  color: var(--text-3);
}

.policy-option {
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.policy-option:hover {
  background: var(--hover);
  color: var(--text);
}
.policy-option.selected {
  color: var(--text);
}

.policy-opt-icon {
  flex-shrink: 0;
  color: currentColor;
}

.policy-opt-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.policy-opt-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.35;
  color: currentColor;
}
.policy-default-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--hover);
  font-size: 10.5px;
  font-weight: 400;
  line-height: 1.3;
  color: var(--text-2);
}
.policy-tag-info {
  flex-shrink: 0;
  color: var(--text-3);
}
.policy-opt-desc {
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-2);
}

.policy-check {
  flex-shrink: 0;
  color: var(--text);
}

.policy-menu-foot {
  padding: 9px 15px 10px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-2);
}
.policy-foot-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--text-3);
}
</style>
