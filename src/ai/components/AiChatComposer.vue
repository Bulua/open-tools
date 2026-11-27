<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  FileText,
  FolderOpen,
  Info,
  Plus,
  Settings,
  ShieldAlert,
  Square,
  X,
} from "lucide-vue-next";
import { usePopover } from "@/composables/usePopover";
import { showError } from "@/utils/errorToast";
import { parsePendingFiles, revokeAttachmentPreview } from "../attachments";
import { pickWorkspaceFolder } from "../builtinTools";
import type {
  ChatAttachment,
  ExecutionPolicy,
  ModelOption,
  ThinkingEffort,
} from "@/types/ai";
import type { SettingsTab } from "./AiSettingsModal.vue";
import AiModelPicker from "./AiModelPicker.vue";

const props = defineProps<{
  availableModels: ModelOption[];
  selectedModelConfigId: string;
  workspaceDir?: string;
  executionPolicy?: ExecutionPolicy;
  streaming: boolean;
}>();

const emit = defineEmits<{
  send: [text: string, attachments: ChatAttachment[]];
  stop: [];
  beforeSubmit: [];
  selectModel: [modelConfigId: string, effort?: ThinkingEffort];
  updateWorkspace: [dir: string];
  updateExecutionPolicy: [policy: ExecutionPolicy];
  openSettings: [tab?: SettingsTab];
}>();

const { t } = useI18n();
const input = ref("");
const pendingFiles = ref<ChatAttachment[]>([]);
const dragging = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const textareaRef = ref<HTMLTextAreaElement>();

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

onBeforeUnmount(() => {
  pendingFiles.value.forEach(revokeAttachmentPreview);
});

async function addFiles(fileList: FileList | File[]) {
  const parsed = await parsePendingFiles(fileList);
  if (parsed.length) {
    pendingFiles.value.push(...parsed);
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
  const target = pendingFiles.value.find((item) => item.id === id);
  if (target) revokeAttachmentPreview(target);
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
  emit("beforeSubmit");
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
        <img v-if="att.kind === 'image' && (att.previewUrl || att.dataUrl)" :src="att.previewUrl || att.dataUrl" :alt="att.name" class="att-thumb" />
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
</template>

<style scoped>
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
  position: absolute;
  inset: 0;
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
  z-index: 1;
  width: 18px;
  height: 18px;
  padding: 0;
  line-height: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.att-remove svg {
  display: block;
  flex-shrink: 0;
}
.att-chip:hover .att-remove,
.att-chip:focus-within .att-remove {
  opacity: 1;
  pointer-events: auto;
}
.att-remove:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--on-danger);
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
  color: var(--on-accent);
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
