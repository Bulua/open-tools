<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Check, FilePenLine, FolderOpen, ShieldCheck, Terminal, Wrench, X } from "lucide-vue-next";
import type { PendingToolApproval, ToolApprovalDecision } from "@/types/ai";

defineProps<{
  approval: PendingToolApproval;
}>();

const emit = defineEmits<{
  decide: [conversationId: string, decision: ToolApprovalDecision];
}>();

const { t } = useI18n();

function formatShellBadge(shell?: string): string {
  const normalized = (shell || "powershell").trim().toLowerCase();
  if (normalized === "cmd") return "CMD";
  if (normalized === "powershell") return "PowerShell";
  return shell || "PowerShell";
}
</script>

<template>
  <div class="approval-card" role="alertdialog" aria-live="polite">
    <div class="approval-head">
      <span class="approval-icon" :class="approval.kind">
        <Terminal v-if="approval.kind === 'command'" :size="15" :stroke-width="1.9" />
        <Wrench v-else-if="approval.kind === 'tool'" :size="15" :stroke-width="1.9" />
        <FilePenLine v-else :size="15" :stroke-width="1.9" />
      </span>
      <span class="approval-title">
        {{
          approval.kind === "command"
            ? t("ai.approval.commandTitle")
            : approval.kind === "tool"
              ? t("ai.approval.toolTitle")
              : t("ai.approval.externalWriteTitle")
        }}
      </span>
      <span class="approval-badge">
        {{
          approval.kind === "command"
            ? formatShellBadge(approval.shell)
            : approval.toolName
        }}
      </span>
    </div>

    <div class="approval-detail">
      <pre v-if="approval.kind === 'command'" class="approval-cmd">{{ approval.command }}</pre>
      <pre v-if="approval.kind === 'tool' && approval.argumentsText" class="approval-cmd">{{ approval.argumentsText }}</pre>
      <div v-if="approval.kind === 'command' && approval.cwd" class="approval-meta">
        <FolderOpen :size="12" class="approval-meta-icon" />
        <span class="approval-meta-label">{{ t("ai.approval.cwdLabel") }}</span>
        <code class="approval-path" :title="approval.cwd">{{ approval.cwd }}</code>
      </div>
      <div v-if="approval.kind === 'externalWrite' && approval.targetPath" class="approval-meta single">
        <FilePenLine :size="12" class="approval-meta-icon" />
        <span class="approval-meta-label">{{ t("ai.approval.pathLabel") }}</span>
        <code class="approval-path" :title="approval.targetPath">{{ approval.targetPath }}</code>
      </div>
    </div>

    <div class="approval-actions">
      <button
        type="button"
        class="approval-btn secondary"
        @click="emit('decide', approval.conversationId, 'session')"
      >
        <ShieldCheck :size="13" />
        <span>{{ t("ai.approval.allowSession") }}</span>
      </button>
      <div class="approval-actions-primary">
        <button
          type="button"
          class="approval-btn deny"
          @click="emit('decide', approval.conversationId, 'deny')"
        >
          <X :size="13" />
          <span>{{ t("ai.approval.deny") }}</span>
        </button>
        <button
          type="button"
          class="approval-btn accept"
          @click="emit('decide', approval.conversationId, 'once')"
        >
          <Check :size="13" />
          <span>{{ t("ai.approval.allowOnce") }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
</style>
