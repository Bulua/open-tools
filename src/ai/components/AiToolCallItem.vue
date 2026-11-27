<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { Check, ChevronRight, Copy, LoaderCircle } from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";
import type { ChatToolCall } from "@/types/ai";

const props = defineProps<{
  call: ChatToolCall;
}>();

const { t } = useI18n();
const { copy } = useClipboard();

const expanded = ref(false);
const copiedTarget = ref<"" | "input" | "output">("");
let copyTimer = 0;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function parseArgsObject(raw?: string): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 非 JSON 参数回退原样显示
  }
  return null;
}

function shortDirPrefix(cwd?: string): string {
  const clean = (cwd ?? "").trim().replace(/[\\/]+$/, "");
  if (!clean) return "$";
  const parts = clean.split(/[\\/]/).filter(Boolean);
  const leaf = parts[parts.length - 1];
  return leaf ? `...\\${leaf} $` : "$";
}

function formatScalarArg(val: unknown): { text: string; cls: string } {
  if (typeof val === "string") {
    const needsQuotes = val === "" || /\s/.test(val);
    return {
      text: needsQuotes ? `"${val}"` : val,
      cls: "arg-str",
    };
  }
  if (typeof val === "number") {
    return { text: String(val), cls: "arg-num" };
  }
  if (typeof val === "boolean" || val === null) {
    return { text: String(val), cls: "arg-lit" };
  }
  return { text: JSON.stringify(val), cls: "arg-str" };
}

/** 折叠态的一行极简摘要 */
const argsSummary = computed(() => {
  const parsed = parseArgsObject(props.call.argumentsText);
  if (!parsed) return "";
  if (props.call.toolName === "run_command" && typeof parsed.command === "string") {
    const cmd = parsed.command.trim().replace(/\s+/g, " ");
    return cmd.length > 64 ? `${cmd.slice(0, 64)}…` : cmd;
  }
  const entries = Object.entries(parsed).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  const preview = entries
    .slice(0, 2)
    .map(([k, v]) => {
      const text = typeof v === "string" ? v.replace(/\s+/g, " ") : JSON.stringify(v);
      const shortVal = text.length > 36 ? `${text.slice(0, 36)}…` : text;
      return `${k}=${shortVal}`;
    })
    .join(" ");
  return entries.length > 2 ? `${preview} …` : preview;
});

interface FormattedInput {
  prompt: string;
  html: string;
  plain: string;
}

/** 将工具入参格式化为命令风格（run_command 直接高亮命令，其余工具展示简洁的命令行参数） */
const inputDisplay = computed<FormattedInput>(() => {
  const parsed = parseArgsObject(props.call.argumentsText);

  if (props.call.toolName === "run_command" && parsed && typeof parsed.command === "string") {
    const command = parsed.command;
    const shell = typeof parsed.shell === "string" ? parsed.shell.toLowerCase() : "powershell";
    const cwd = typeof parsed.cwd === "string" ? parsed.cwd : undefined;
    const lang = shell === "cmd" ? "dos" : "powershell";
    const highlighted = hljs.getLanguage(lang)
      ? hljs.highlight(command, { language: lang, ignoreIllegals: true }).value
      : escapeHtml(command);
    return {
      prompt: shortDirPrefix(cwd),
      html: DOMPurify.sanitize(highlighted),
      plain: command,
    };
  }

  if (!parsed) {
    const raw = (props.call.argumentsText ?? "").trim() || props.call.toolName;
    return { prompt: "", html: escapeHtml(raw), plain: raw };
  }

  const entries = Object.entries(parsed).filter(([, v]) => v !== undefined);
  if (!entries.length) {
    const name = props.call.toolName;
    return {
      prompt: "",
      html: `<span class="arg-cmd">${escapeHtml(name)}</span>`,
      plain: name,
    };
  }

  const inlineHtml: string[] = [`<span class="arg-cmd">${escapeHtml(props.call.toolName)}</span>`];
  const inlinePlain: string[] = [props.call.toolName];
  const blockHtml: string[] = [];
  const blockPlain: string[] = [];

  for (const [key, val] of entries) {
    if (typeof val === "string" && (val.includes("\n") || val.length > 160)) {
      blockHtml.push(`<span class="arg-key">${escapeHtml(key)}:</span>\n${escapeHtml(val)}`);
      blockPlain.push(`${key}:\n${val}`);
    } else {
      const formatted = formatScalarArg(val);
      inlineHtml.push(
        `<span class="arg-key">${escapeHtml(key)}</span>=<span class="${formatted.cls}">${escapeHtml(formatted.text)}</span>`,
      );
      inlinePlain.push(`${key}=${formatted.text}`);
    }
  }

  const html = blockHtml.length
    ? `${inlineHtml.join(" ")}\n\n${blockHtml.join("\n\n")}`
    : inlineHtml.join(" ");
  const plain = blockPlain.length
    ? `${inlinePlain.join(" ")}\n\n${blockPlain.join("\n\n")}`
    : inlinePlain.join(" ");

  return { prompt: "", html, plain };
});

const outputText = computed(() => {
  const raw = props.call.resultText;
  if (raw === undefined) return "";
  return raw.replace(/^\r?\n+|\r?\n+$/g, "");
});

async function copySection(target: "input" | "output", text: string) {
  if (!text) return;
  await copy(text);
  copiedTarget.value = target;
  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => {
    if (copiedTarget.value === target) copiedTarget.value = "";
  }, 1400);
}

onBeforeUnmount(() => {
  window.clearTimeout(copyTimer);
});
</script>

<template>
  <div class="tool-call-item">
    <button
      type="button"
      class="tool-summary"
      :class="{ open: expanded, error: call.status === 'error' }"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <LoaderCircle v-if="call.status === 'running'" :size="13" class="spin status-running" />
      <span v-else class="status-dot" :class="call.status" />
      <span class="tool-label">{{ call.toolName }}</span>
      <span v-if="argsSummary" class="tool-args-preview">{{ argsSummary }}</span>
      <span v-if="call.serverName" class="tool-server">{{ call.serverName }}</span>
      <ChevronRight :size="13" class="chevron" :class="{ open: expanded }" />
    </button>

    <div class="fold-panel" :class="{ open: expanded }">
      <div class="fold-inner">
        <div class="tool-card">
          <div class="tool-input">
            <div class="tool-cmd-row">
              <span v-if="inputDisplay.prompt" class="tool-prompt">{{ inputDisplay.prompt }}</span>
              <code class="tool-cmd-code hljs" v-html="inputDisplay.html" />
            </div>
            <button
              type="button"
              class="card-copy-btn"
              :class="{ ok: copiedTarget === 'input' }"
              :title="copiedTarget === 'input' ? t('ai.copied') : t('common.copy')"
              :aria-label="copiedTarget === 'input' ? t('ai.copied') : t('common.copy')"
              @click="copySection('input', inputDisplay.plain)"
            >
              <Check v-if="copiedTarget === 'input'" :size="13" />
              <Copy v-else :size="13" />
            </button>
          </div>

          <div
            v-if="outputText"
            class="tool-output"
            :class="{ 'is-error': call.status === 'error' }"
          >
            <pre class="tool-out-pre">{{ outputText }}</pre>
            <button
              type="button"
              class="card-copy-btn"
              :class="{ ok: copiedTarget === 'output' }"
              :title="copiedTarget === 'output' ? t('ai.copied') : t('common.copy')"
              :aria-label="copiedTarget === 'output' ? t('ai.copied') : t('common.copy')"
              @click="copySection('output', outputText)"
            >
              <Check v-if="copiedTarget === 'output'" :size="13" />
              <Copy v-else :size="13" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-call-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.chevron {
  transition: transform var(--dur) var(--ease-out);
}
.chevron.open {
  transform: rotate(90deg);
}

.fold-panel {
  width: 100%;
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

.tool-summary {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 8px 4px 6px;
  margin-left: -6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.tool-summary:hover,
.tool-summary.open {
  background: var(--hover);
  color: var(--text);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.done {
  background: var(--success);
}
.status-dot.error {
  background: var(--danger);
}
.status-running {
  color: var(--accent);
  flex-shrink: 0;
}

.tool-label {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text);
  flex-shrink: 0;
}
.tool-summary.error .tool-label {
  color: var(--danger);
}
.tool-args-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
}
.tool-server {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  font-size: 10.5px;
  color: var(--text-3);
}

/* 统一单滚动条卡片：上方命令/参数，中间细线分隔，下方直接展示输出 */
.tool-card {
  margin-top: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  max-height: 260px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}

.tool-input,
.tool-output {
  position: relative;
  padding: 10px 36px 10px 14px;
}

.tool-output {
  border-top: 1px solid var(--border);
  padding-top: 11px;
  padding-bottom: 12px;
}

.tool-cmd-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
}
.tool-prompt {
  flex-shrink: 0;
  color: var(--text-3);
  user-select: none;
}
.tool-cmd-code {
  flex: 1;
  min-width: 0;
  font-family: inherit;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  user-select: text;
}

.tool-out-pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  user-select: text;
}
.tool-output.is-error .tool-out-pre {
  color: var(--danger);
}

.card-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.tool-input:hover .card-copy-btn,
.tool-output:hover .card-copy-btn,
.card-copy-btn:focus-visible,
.card-copy-btn.ok {
  opacity: 1;
}
.card-copy-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.card-copy-btn.ok {
  color: var(--success);
}

.tool-cmd-code :deep(.arg-cmd) { color: var(--accent); font-weight: 500; }
.tool-cmd-code :deep(.arg-key) { color: var(--syntax-key); }
.tool-cmd-code :deep(.arg-str) { color: var(--syntax-string); }
.tool-cmd-code :deep(.arg-num) { color: var(--syntax-number); }
.tool-cmd-code :deep(.arg-lit) { color: var(--syntax-literal); }
.tool-cmd-code :deep(.hljs-comment),
.tool-cmd-code :deep(.hljs-quote) { color: var(--text-3); font-style: italic; }
.tool-cmd-code :deep(.hljs-keyword),
.tool-cmd-code :deep(.hljs-selector-tag),
.tool-cmd-code :deep(.hljs-built_in) { color: var(--syntax-literal); }
.tool-cmd-code :deep(.hljs-string),
.tool-cmd-code :deep(.hljs-regexp),
.tool-cmd-code :deep(.hljs-addition) { color: var(--syntax-string); }
.tool-cmd-code :deep(.hljs-number),
.tool-cmd-code :deep(.hljs-literal),
.tool-cmd-code :deep(.hljs-variable) { color: var(--syntax-number); }
.tool-cmd-code :deep(.hljs-title),
.tool-cmd-code :deep(.hljs-section),
.tool-cmd-code :deep(.hljs-attr),
.tool-cmd-code :deep(.hljs-name) { color: var(--syntax-key); }

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
