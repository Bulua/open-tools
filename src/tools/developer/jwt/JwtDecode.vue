<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { CircleAlert, ClipboardPaste, KeyRound, Plus } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useClipboard } from "@/composables/useClipboard";
import { useToolResult } from "@/composables/useToolUsage";
import { formatDateTime, relativeTime } from "@/utils/time";
import DevHistoryList, { type DevHistoryItem, type DevHistoryTone } from "../shared/components/DevHistoryList.vue";
import { MAX_HISTORY, createHistoryId, formatHistoryTime, loadHistory, previewLine, saveHistory } from "../shared/history";
import { decodeJwt, jwtStatus, type JwtStatus } from "./jwt";

interface JwtRecord {
  id: string;
  token: string;
  alg: string;
  status: JwtStatus;
  updatedAt: number;
}

const STORAGE_KEY = "jwt.records";
const { t, locale } = useI18n();
const { paste } = useClipboard();

const token = ref("");
const transitionTick = ref(0);

const decoded = computed(() => {
  if (!token.value.trim()) return null;
  try {
    return { ok: true as const, ...decodeJwt(token.value) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
});

const json = (v: unknown) => JSON.stringify(v, null, 2);

const STATUS_TONE: Record<JwtStatus, DevHistoryTone> = {
  valid: "success",
  expired: "danger",
  notYetValid: "warning",
  noExpiry: "muted",
};

const TIME_CLAIMS = ["iat", "nbf", "exp"] as const;

const summary = computed(() => {
  const d = decoded.value;
  if (!d?.ok) return null;
  const times = TIME_CLAIMS.filter((k) => typeof d.payload[k] === "number").map((k) => {
    const ms = (d.payload[k] as number) * 1000;
    return { label: t(`encode.${k}`), value: formatDateTime(new Date(ms)), relative: relativeTime(ms) };
  });
  const status = jwtStatus(d.payload);
  return {
    alg: String(d.header.alg ?? t("encode.unknown")),
    statusKey: status,
    status: { label: t(`encode.${status}`), tone: STATUS_TONE[status] },
    times,
  };
});

// ---------- 历史记录 ----------

const records = ref<JwtRecord[]>(loadHistory<JwtRecord>(STORAGE_KEY));
const activeId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => clearTimeout(recordTimer));

const persist = () =>
  saveHistory(STORAGE_KEY, records.value, MAX_HISTORY, 120_000, (r) => r.token.length);

watch([token, summary], () => {
  if (restoring) return;
  clearTimeout(recordTimer);
  if (!summary.value || !token.value.trim()) return;
  const s = summary.value;
  recordTimer = setTimeout(() => {
    const now = Date.now();
    const idx = activeId.value ? records.value.findIndex((r) => r.id === activeId.value) : -1;
    if (idx >= 0) {
      records.value[idx] = { ...records.value[idx], token: token.value, alg: s.alg, status: s.statusKey, updatedAt: now };
      persist();
      return;
    }
    const created: JwtRecord = {
      id: createHistoryId(),
      token: token.value,
      alg: s.alg,
      status: s.statusKey,
      updatedAt: now,
    };
    records.value = [created, ...records.value].slice(0, MAX_HISTORY);
    activeId.value = created.id;
    persist();
  }, 450);
});

const historyItems = computed<DevHistoryItem[]>(() =>
  records.value.map((r) => ({
    id: r.id,
    tag: `${r.alg} · ${t(`encode.${r.status}`)}`,
    tone: STATUS_TONE[r.status] ?? "muted",
    time: formatHistoryTime(r.updatedAt, locale.value),
    title: previewLine(r.token, 42),
    subtitle: t("dev.chars", { n: r.token.length.toLocaleString() }),
  })),
);

const pasteToken = async () => {
  const pasted = await paste();
  if (pasted) {
    activeId.value = null;
    token.value = pasted;
  }
};

const startNew = () => {
  clearTimeout(recordTimer);
  activeId.value = null;
  token.value = "";
  transitionTick.value++;
};

const selectRecord = async (id: string) => {
  const row = records.value.find((r) => r.id === id);
  if (!row || activeId.value === id) return;
  clearTimeout(recordTimer);
  restoring = true;
  activeId.value = row.id;
  token.value = row.token;
  transitionTick.value++;
  await nextTick();
  restoring = false;
};

const removeRecord = (id: string) => {
  records.value = records.value.filter((r) => r.id !== id);
  if (activeId.value === id) activeId.value = null;
  persist();
};

const clearRecords = () => {
  records.value = [];
  activeId.value = null;
  persist();
};

useToolResult(() => (decoded.value?.ok ? token.value : ""));
</script>

<template>
  <div class="workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("dev.actions") }}</h3>
        <div class="action-grid">
          <button type="button" class="btn small" @click="pasteToken">
            <ClipboardPaste :size="13" />{{ t("common.paste") }}
          </button>
          <button type="button" class="btn small" :disabled="!token && !activeId" @click="startNew">
            <Plus :size="13" />{{ t("dev.newEntry") }}
          </button>
        </div>
      </section>

      <Transition name="panel-swap" mode="out-in">
        <section v-if="summary" key="summary" class="section summary-section">
          <header class="summary-head">
            <h3>{{ t("encode.summary") }}</h3>
            <span class="note">{{ t("encode.noSignature") }}</span>
          </header>
          <div class="summary-list">
            <div class="summary-row">
              <span class="label">{{ t("encode.status") }}</span>
              <span class="chip" :class="summary.status.tone">{{ summary.status.label }}</span>
            </div>
            <div class="summary-row">
              <span class="label">{{ t("encode.algorithm") }}</span>
              <span class="value">{{ summary.alg }}</span>
            </div>
            <div v-for="time in summary.times" :key="time.label" class="summary-row">
              <span class="label">{{ time.label }}</span>
              <span class="value">{{ time.value }}<em>{{ t("encode.paren", { text: time.relative }) }}</em></span>
            </div>
          </div>
        </section>
      </Transition>

      <DevHistoryList :items="historyItems" :active-id="activeId" @select="selectRecord" @remove="removeRecord" @clear="clearRecords" />
    </aside>

    <main class="stage">
      <Transition name="stage-swap" mode="out-in">
        <div :key="transitionTick" class="jwt-stage">
          <TextPane v-model="token" class="input" copyable label="JWT" :placeholder="t('encode.jwtPlaceholder')">
            <template #actions>
              <span v-if="token" class="count-pill">{{ t("dev.chars", { n: token.length.toLocaleString() }) }}</span>
            </template>
          </TextPane>

          <div v-if="summary && decoded?.ok" class="jwt-panels">
            <TextPane :model-value="json(decoded.header)" class="header" label="Header" readonly language="json" />
            <TextPane :model-value="json(decoded.payload)" class="payload" label="Payload" readonly language="json" />
          </div>
          <section v-else-if="decoded && !decoded.ok" class="card state-card error" role="alert">
            <span class="state-icon"><CircleAlert :size="18" /></span>
            <p>{{ decoded.message }}</p>
          </section>
          <section v-else class="card state-card">
            <span class="state-icon"><KeyRound :size="18" /></span>
            <p>{{ t("encode.jwtHint") }}</p>
          </section>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.workbench {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.sidebar {
  flex: 0 0 296px;
  min-height: 0;
  box-shadow: var(--shadow-sm);
}
.sidebar h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.action-grid .btn {
  justify-content: center;
}
.summary-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.note {
  font-size: 11px;
  color: var(--text-3);
}
.summary-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-sunken);
  min-width: 0;
}
.label {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--text-3);
}
.value {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.value em {
  font-family: var(--font-sans);
  font-style: normal;
  font-size: 11px;
  color: var(--text-3);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
}
.chip::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
.chip.success {
  color: var(--success);
  background: var(--success-soft);
}
.chip.danger {
  color: var(--danger);
  background: var(--danger-soft);
}
.chip.warning {
  color: var(--warning);
  background: var(--warning-soft);
}
.chip.muted {
  color: var(--text-2);
  background: var(--active);
}
.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.jwt-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.input {
  flex: 0 0 132px;
  min-height: 110px;
}
.jwt-panels {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.header {
  flex: 0 0 auto;
  min-height: 116px;
  max-height: 165px;
}
.payload {
  flex: 1;
  min-height: 180px;
}
.count-pill {
  margin-right: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--active);
  color: var(--text-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.state-card {
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 28px 24px;
  text-align: center;
  color: var(--text-3);
  box-shadow: var(--shadow-sm);
}
.state-card p {
  margin: 0;
  max-width: 380px;
  font-size: 13px;
  line-height: 1.6;
}
.state-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  color: var(--text-3);
}
.state-card.error p {
  color: var(--danger);
}
.state-card.error .state-icon {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 24%, transparent);
}
.stage-swap-enter-active,
.panel-swap-enter-active {
  transition: opacity var(--dur) var(--ease-out), translate var(--dur) var(--ease-out);
}
.stage-swap-leave-active,
.panel-swap-leave-active {
  transition: opacity var(--dur-fast) ease-in, translate var(--dur-fast) ease-in;
}
.stage-swap-enter-from,
.panel-swap-enter-from {
  opacity: 0;
  translate: 0 5px;
}
.stage-swap-leave-to,
.panel-swap-leave-to {
  opacity: 0;
  translate: 0 -4px;
}
@media (max-width: 860px) {
  .workbench {
    flex: none;
    width: 100%;
    flex-direction: column;
  }
  .sidebar {
    flex: none;
  }
}
</style>
