<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  ArrowDown,
  ArrowUp,
  Eraser,
  FileText,
  Plus,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
} from "lucide-vue-next";
import AppSelect, { type SelectOption } from "@/components/common/AppSelect.vue";
import { usePopover } from "@/composables/usePopover";
import { showError } from "@/utils/errorToast";
import { makeEntityId } from "../presets";
import type { AiConfig, ChatAttachment, Conversation, ModelOption, ThinkingEffort } from "../types";
import type { SettingsTab } from "./AiSettingsModal.vue";
import AiMessageItem from "./AiMessageItem.vue";
import AiModelPicker from "./AiModelPicker.vue";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 100_000;

const props = defineProps<{
  config: AiConfig;
  conversation: Conversation | null;
  availableModels: ModelOption[];
  selectedModelConfigId: string;
  promptPresetId: string;
  systemPrompt: string;
  temperature: number | null;
  streaming: boolean;
}>();

const emit = defineEmits<{
  send: [text: string, attachments: ChatAttachment[]];
  stop: [];
  selectModel: [modelConfigId: string, effort?: ThinkingEffort];
  updateOverrides: [patch: { promptPresetId?: string; systemPrompt?: string; temperature?: number | null }];
  regenerate: [messageId: string];
  editMessage: [messageId: string, content: string];
  deleteMessage: [messageId: string];
  clearMessages: [];
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

const paramsBtn = ref<HTMLElement>();
const paramsPanel = ref<HTMLElement>();
const { open: paramsOpen, style: paramsStyle, toggle: toggleParams, close: closeParams } = usePopover(
  paramsBtn,
  paramsPanel,
  { minWidth: 340, maxHeight: 460 },
);

const promptPresetOptions = computed<SelectOption<string>[]>(() => [
  { value: "", label: t("datetime.none") },
  ...props.config.prompts.map((p) => ({
    value: p.id,
    label: p.name,
  })),
]);

const localPromptPresetId = computed<string>({
  get: () => props.promptPresetId,
  set: (value: string) => emit("updateOverrides", { promptPresetId: value }),
});

const messages = computed(() => props.conversation?.messages ?? []);
const chatTitle = computed(() => props.conversation?.title || t("ai.newChat"));
const canSend = computed(
  () =>
    !props.streaming &&
    (input.value.trim().length > 0 || pendingFiles.value.length > 0) &&
    props.availableModels.length > 0,
);
const sendHint = computed(() =>
  props.config.settings.sendKey === "ctrlEnter" ? t("ai.sendHintCtrlEnter") : t("ai.sendHintEnter"),
);

const localSystemPrompt = computed({
  get: () => props.systemPrompt,
  set: (value: string) => emit("updateOverrides", { systemPrompt: value }),
});

const useCustomTemp = computed({
  get: () => props.temperature !== null,
  set: (enabled: boolean) =>
    emit("updateOverrides", { temperature: enabled ? props.config.settings.temperature : null }),
});

const localTemp = computed({
  get: () => props.temperature ?? props.config.settings.temperature,
  set: (value: number) => emit("updateOverrides", { temperature: value }),
});

function resizeTextarea() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
}

watch(input, () => nextTick(resizeTextarea));

function scrollToBottom(smooth = false) {
  const el = scrollRef.value;
  if (!el) return;
  stickToBottom.value = true;
  if (typeof el.scrollTo === "function") {
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

function onScroll() {
  const el = scrollRef.value;
  if (!el) return;
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
}

watch(
  () => props.conversation?.id,
  () => {
    stickToBottom.value = true;
    nextTick(() => scrollToBottom(false));
  },
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
  const mode = props.config.settings.sendKey;
  if (mode === "enter") {
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      submit();
    }
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
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
          ref="paramsBtn"
          type="button"
          class="icon-btn"
          :class="{ active: paramsOpen }"
          :title="t('ai.sessionSettings')"
          :aria-label="t('ai.sessionSettings')"
          :aria-expanded="paramsOpen"
          @click="toggleParams"
        >
          <SlidersHorizontal :size="15" />
        </button>
      </div>

      <Teleport to="body">
        <Transition name="pop">
          <div v-if="paramsOpen" ref="paramsPanel" class="params-popover" :style="paramsStyle">
            <div v-if="config.prompts.length" class="params-section">
              <label class="params-label">{{ t("ai.sessionPromptPreset") }}</label>
              <AppSelect
                v-model="localPromptPresetId"
                :options="promptPresetOptions"
                size="sm"
              />
            </div>

            <div class="params-section">
              <label class="params-label" for="ai-session-system">{{ t("ai.sessionSystemPrompt") }}</label>
              <textarea
                id="ai-session-system"
                v-model="localSystemPrompt"
                class="params-textarea"
                rows="4"
                :placeholder="t('ai.sessionSystemPromptPlaceholder')"
              />
            </div>

            <div class="params-section">
              <div class="params-row">
                <span class="params-label">{{ t("ai.sessionTemperature") }}</span>
                <label class="check">
                  <input v-model="useCustomTemp" type="checkbox" />
                  <span>{{ useCustomTemp ? localTemp.toFixed(1) : t("ai.followGlobal", { value: config.settings.temperature.toFixed(1) }) }}</span>
                </label>
              </div>
              <div v-if="useCustomTemp" class="slider">
                <input v-model.number="localTemp" type="range" min="0" max="2" step="0.1" />
                <em>{{ localTemp.toFixed(1) }}</em>
              </div>
            </div>

            <div v-if="messages.length" class="params-foot">
              <button
                type="button"
                class="btn small subtle danger-text"
                :disabled="streaming"
                @click="closeParams(); emit('clearMessages')"
              >
                <Eraser :size="13" />
                <span>{{ t("ai.clearMessages") }}</span>
              </button>
            </div>
          </div>
        </Transition>
      </Teleport>
    </header>

    <div ref="scrollRef" class="message-scroll" @scroll="onScroll">
      <div v-if="messages.length" class="message-list">
        <AiMessageItem
          v-for="(msg, index) in messages"
          :key="msg.id"
          :message="msg"
          :streaming="streaming && index === messages.length - 1 && msg.role === 'assistant'"
          @regenerate="emit('regenerate', $event)"
          @edit="(id, content) => emit('editMessage', id, content)"
          @delete="emit('deleteMessage', $event)"
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

    <div class="composer-wrap">
      <button
        v-if="!stickToBottom && messages.length"
        type="button"
        class="scroll-bottom-btn"
        :aria-label="t('ai.send')"
        @click="scrollToBottom(true)"
      >
        <ArrowDown :size="15" />
      </button>

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
          </div>

          <div class="composer-right">
            <span class="send-hint">{{ sendHint }}</span>
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
              :title="t('ai.send')"
              :aria-label="t('ai.send')"
              @click="submit"
            >
              <ArrowUp :size="16" />
            </button>
          </div>
        </div>
      </div>
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

.message-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px 24px;
  scrollbar-width: thin;
}

.message-list {
  max-width: 780px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.welcome-state {
  height: 100%;
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
  padding: 8px 20px 18px;
}

.scroll-bottom-btn {
  position: absolute;
  top: -36px;
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
  max-width: 780px;
  margin: 0 auto;
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

.composer-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}
.send-hint {
  font-size: 11.5px;
  color: var(--text-3);
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

.params-popover {
  position: fixed;
  z-index: 120;
  width: 340px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.params-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.params-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.params-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.params-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.55;
  resize: vertical;
  outline: none;
}
.params-textarea:focus {
  border-color: var(--accent);
}
.params-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.danger-text {
  color: var(--danger);
}
.danger-text:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
</style>
