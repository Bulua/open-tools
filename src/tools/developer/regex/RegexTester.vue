<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, CircleAlert, Copy, Plus, Search } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useClipboard } from "@/composables/useClipboard";
import { useStoredRef } from "@/composables/useStoredRef";
import { useToolUsage } from "@/composables/useToolUsage";
import { locale, translationOf } from "@/locales";
import DevHistoryList, { type DevHistoryItem } from "../shared/components/DevHistoryList.vue";
import { MAX_HISTORY, createHistoryId, formatHistoryTime, loadHistory, previewLine, saveHistory } from "../shared/history";
import { PRESETS, type RegexResult } from "./regex";

interface RegexRecord {
  id: string;
  pattern: string;
  flags: string;
  text: string;
  replacement: string;
  useReplace: boolean;
  matchCount: number;
  updatedAt: number;
}

const STORAGE_KEY = "regex.records";
const { t } = useI18n();

const pattern = useStoredRef("regex.pattern", "(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})");
const flags = useStoredRef("regex.flags", "g");
const text = ref(t("utility.sampleText"));
const replacement = ref("");
const useReplace = ref(false);
const transitionTick = ref(0);

const FLAGS = computed(() => ["g", "i", "m", "s", "u"].map((flag) => ({ flag, title: t(`utility.flag${flag.toUpperCase()}`) })));
const toggleFlag = (f: string) => {
  flags.value = flags.value.includes(f)
    ? flags.value.replace(f, "")
    : "gimsuy".split("").filter((x) => x === f || flags.value.includes(x)).join("");
};

// ---------- 后台线程 ----------
const TIMEOUT = 1500;
let worker: Worker | null = null;
let requestId = 0;
let userEdited = false;
const { track: trackUsage, cancel: cancelUsage } = useToolUsage();
let timer: ReturnType<typeof setTimeout> | undefined;
const result = ref<RegexResult>({ ok: true, matches: [], truncated: false });
const timedOut = ref(false);
const running = ref(false);

const records = ref<RegexRecord[]>(loadHistory<RegexRecord>(STORAGE_KEY));
const activeId = ref<string | null>(null);
let restoring = false;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

const persist = () =>
  saveHistory(STORAGE_KEY, records.value, MAX_HISTORY, 100_000, (r) => r.pattern.length + r.text.length);

const createWorker = () => {
  worker = new Worker(new URL("./regex.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; result: RegexResult }>) => {
    if (e.data.id !== requestId) return;
    clearTimeout(timer);
    running.value = false;
    timedOut.value = false;
    result.value = e.data.result;
    if (userEdited && result.value.ok && pattern.value && text.value) trackUsage();
    else cancelUsage();
  };
};
createWorker();

onBeforeUnmount(() => {
  clearTimeout(debounce);
  clearTimeout(timer);
  clearTimeout(recordTimer);
  worker?.terminate();
});

let debounce: ReturnType<typeof setTimeout> | undefined;
const run = () => {
  cancelUsage();
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const id = ++requestId;
    running.value = true;
    worker!.postMessage({
      id,
      pattern: pattern.value,
      flags: flags.value,
      text: text.value,
      replacement: useReplace.value ? replacement.value : undefined,
    });
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (id !== requestId) return;
      worker!.terminate();
      createWorker();
      running.value = false;
      timedOut.value = true;
      result.value = { ok: true, matches: [], truncated: false };
    }, TIMEOUT);
  }, 120);
};
watch([pattern, flags, text, replacement, useReplace], () => {
  userEdited = true;
  run();
  if (restoring) return;
  clearTimeout(recordTimer);
  if (!pattern.value.trim()) return;
  recordTimer = setTimeout(() => {
    if (!result.value.ok || timedOut.value) return;
    const now = Date.now();
    const idx = activeId.value ? records.value.findIndex((r) => r.id === activeId.value) : -1;
    if (idx >= 0) {
      records.value[idx] = {
        ...records.value[idx],
        pattern: pattern.value,
        flags: flags.value,
        text: text.value,
        replacement: replacement.value,
        useReplace: useReplace.value,
        matchCount: result.value.matches.length,
        updatedAt: now,
      };
      persist();
      return;
    }
    const created: RegexRecord = {
      id: createHistoryId(),
      pattern: pattern.value,
      flags: flags.value,
      text: text.value,
      replacement: replacement.value,
      useReplace: useReplace.value,
      matchCount: result.value.matches.length,
      updatedAt: now,
    };
    records.value = [created, ...records.value].slice(0, MAX_HISTORY);
    activeId.value = created.id;
    persist();
  }, 600);
});
run();

// ---------- 显示 ----------
const activeIndex = ref<number | null>(null);
const marks = computed(() =>
  result.value.matches.map((m, i) => ({
    from: m.index,
    to: m.end,
    className: `${i % 2 ? "cm-mark-b" : "cm-mark-a"}${i === activeIndex.value ? " cm-mark-active" : ""}`,
  })),
);

const summary = computed(() => {
  const n = result.value.matches.length;
  if (!pattern.value) return t("utility.enterRegex");
  if (!n) return t("utility.noMatch");
  return t("utility.matches", { n: `${n}${result.value.truncated ? "+" : ""}` });
});

const historyItems = computed<DevHistoryItem[]>(() =>
  records.value.map((r) => ({
    id: r.id,
    tag: r.matchCount ? t("utility.matches", { n: r.matchCount }) : t("utility.noMatch"),
    tone: r.matchCount ? "accent" : "muted",
    time: formatHistoryTime(r.updatedAt, locale.value),
    title: `/${r.pattern}/${r.flags}`,
    subtitle: previewLine(r.text, 50),
  })),
);

const applyPreset = (p: (typeof PRESETS)[number]) => {
  clearTimeout(recordTimer);
  activeId.value = null;
  pattern.value = p.pattern;
  if (p.flags) flags.value = p.flags;
};

const startNew = () => {
  clearTimeout(recordTimer);
  activeId.value = null;
  pattern.value = "";
  replacement.value = "";
  transitionTick.value++;
};

const selectRecord = async (id: string) => {
  const row = records.value.find((r) => r.id === id);
  if (!row || activeId.value === id) return;
  clearTimeout(recordTimer);
  restoring = true;
  activeId.value = row.id;
  pattern.value = row.pattern;
  flags.value = row.flags;
  text.value = row.text;
  replacement.value = row.replacement;
  useReplace.value = row.useReplace;
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

const { copied, copy } = useClipboard();
const show = (s: string | undefined) => (s === undefined ? t("utility.unmatched") : s === "" ? t("utility.empty") : s);
</script>

<template>
  <div class="workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("dev.flags") }}</h3>
        <div class="flags-grid">
          <button
            v-for="f in FLAGS"
            :key="f.flag"
            type="button"
            class="flag-btn"
            :class="{ on: flags.includes(f.flag) }"
            :title="f.title"
            @click="toggleFlag(f.flag)"
          >
            {{ f.flag }}
          </button>
        </div>

        <div class="switch-row">
          <span>{{ t("utility.replace") }}</span>
          <button
            type="button"
            class="control-switch"
            role="switch"
            :aria-checked="useReplace"
            :aria-label="t('utility.replace')"
            @click="useReplace = !useReplace"
          >
            <span />
          </button>
        </div>

        <div class="action-grid">
          <button type="button" class="btn small copy-btn" :class="{ ok: copied }" :disabled="!pattern" @click="copy(`/${pattern}/${flags}`)">
            <Check v-if="copied" :size="13" />
            <Copy v-else :size="13" />
            {{ t("utility.copy") }}
          </button>
          <button type="button" class="btn small" :disabled="!pattern && !activeId" @click="startNew">
            <Plus :size="13" />{{ t("dev.newEntry") }}
          </button>
        </div>
      </section>

      <section class="section">
        <h3>{{ t("dev.presets") }}</h3>
        <div class="presets">
          <button
            v-for="p in PRESETS"
            :key="p.label"
            type="button"
            class="preset"
            :class="{ on: pattern === p.pattern }"
            :title="p.pattern"
            @click="applyPreset(p)"
          >
            {{ translationOf(p.i18n, locale) ?? p.label }}
          </button>
        </div>
      </section>

      <DevHistoryList :items="historyItems" :active-id="activeId" @select="selectRecord" @remove="removeRecord" @clear="clearRecords" />
    </aside>

    <main class="stage">
      <!-- 正则输入栏（保持常驻避免输入失焦） -->
      <section class="card pattern-bar" :class="{ invalid: !result.ok || timedOut }">
        <div class="pattern-row">
          <span class="slash">/</span>
          <input v-model="pattern" class="pattern" spellcheck="false" :placeholder="t('utility.regexPlaceholder')" />
          <span class="slash">/{{ flags }}</span>
        </div>
        <p v-if="!result.ok" class="error" role="alert"><CircleAlert :size="14" />{{ t("utility.syntaxError", { error: result.error }) }}</p>
        <p v-else-if="timedOut" class="error" role="alert">
          <CircleAlert :size="14" />{{ t("utility.timeout", { n: TIMEOUT / 1000 }) }}
        </p>
      </section>

      <Transition name="stage-swap" mode="out-in">
        <div :key="transitionTick" class="body">
          <TextPane
            v-model="text"
            class="text"
            copyable
            :label="t('utility.testText')"
            language="text"
            :code-marks="marks"
            :placeholder="t('utility.testPlaceholder')"
          >
            <template #actions>
              <span class="count" :class="{ zero: !result.matches.length }">{{ running ? t("utility.running") : summary }}</span>
            </template>
          </TextPane>

          <div class="side">
            <section class="card matches">
              <header class="card-title">{{ t("utility.matchResults") }}</header>
              <ol v-if="result.matches.length" class="list">
                <li
                  v-for="(m, i) in result.matches"
                  :key="i"
                  class="match"
                  :class="{ active: activeIndex === i }"
                  @mouseenter="activeIndex = i"
                  @mouseleave="activeIndex = null"
                >
                  <div class="match-head">
                    <span class="no">{{ i + 1 }}</span>
                    <code class="match-text">{{ show(m.text) }}</code>
                    <span class="pos">{{ m.index }}–{{ m.end }}</span>
                  </div>
                  <div v-if="m.groups.length" class="groups">
                    <div v-for="(g, gi) in m.groups" :key="gi" class="group">
                      <span class="group-name">${{ gi + 1 }}</span>
                      <code>{{ show(g) }}</code>
                    </div>
                    <div v-for="(v, name) in m.named" :key="name" class="group">
                      <span class="group-name">&lt;{{ name }}&gt;</span>
                      <code>{{ show(v) }}</code>
                    </div>
                  </div>
                </li>
              </ol>
              <div v-else class="empty">
                <span class="empty-icon"><Search :size="16" /></span>
                <p>{{ summary }}</p>
              </div>
            </section>

            <section v-if="useReplace" class="card replace">
              <header class="card-title">
                <span>{{ t("utility.replace") }}</span>
                <span class="hint" :title="t('utility.replaceHint')">{{ t("utility.replaceHint") }}</span>
              </header>
              <div class="replace-body">
                <input v-model="replacement" class="field mono" spellcheck="false" :placeholder="t('utility.replacePlaceholder')" />
                <TextPane :model-value="result.replaced ?? ''" class="replaced" :label="t('utility.replaced')" readonly />
              </div>
            </section>
          </div>
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
.flags-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-sunken);
}
.flag-btn {
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-3);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.flag-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.flag-btn.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
  font-size: 13px;
  color: var(--text);
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.action-grid .btn {
  justify-content: center;
}
.copy-btn.ok {
  color: var(--success);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.preset {
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-sunken);
  font-size: 12px;
  color: var(--text-2);
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.preset:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface);
}
.preset.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}

.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---------- 正则输入栏 ---------- */
.pattern-bar {
  flex-shrink: 0;
  padding: 8px 14px;
  gap: 8px;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur) var(--ease-out);
}
.pattern-bar:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.pattern-bar.invalid {
  border-color: var(--danger);
}
.pattern-bar.invalid:focus-within {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-soft);
}
.pattern-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.slash {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 600;
  color: var(--accent);
  opacity: 0.78;
}
.pattern {
  flex: 1;
  min-width: 0;
  height: 34px;
  border: none;
  outline: none;
  background: none;
  font-family: var(--font-mono);
  font-size: 14.5px;
}
.error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--danger) 24%, transparent);
  border-radius: 7px;
  background: var(--danger-soft);
}

/* ---------- 文本与结果 ---------- */
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}
.text {
  flex: 1;
  min-height: 260px;
}
.count {
  margin-right: 4px;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.count.zero {
  background: var(--active);
  color: var(--text-3);
}
.side {
  flex: 0 0 clamp(280px, 38%, 400px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.matches,
.replace {
  box-shadow: var(--shadow-sm);
}
.matches {
  flex: 1;
  min-height: 160px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}
.match {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-sunken);
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.match.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.match-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.no {
  flex-shrink: 0;
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}
.match.active .no {
  border-color: var(--accent);
  color: var(--accent);
}
.match-text {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  word-break: break-all;
  user-select: text;
}
.pos {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.groups {
  margin: 7px 0 0 11px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.group {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}
.group-name {
  flex-shrink: 0;
  min-width: 64px;
  color: var(--accent);
  font-family: var(--font-mono);
}
.group code {
  font-family: var(--font-mono);
  word-break: break-all;
  user-select: text;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 16px;
  text-align: center;
  color: var(--text-3);
}
.empty p {
  margin: 0;
  font-size: 13px;
}
.empty-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
}
.replace {
  flex-shrink: 0;
}
.hint {
  margin-left: auto;
  padding-right: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
  color: var(--text-3);
}
.replace-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
}
.field.mono {
  height: 32px;
}
.replaced {
  min-height: 110px;
  max-height: 200px;
  box-shadow: none;
}
.stage-swap-enter-active {
  transition: opacity var(--dur) var(--ease-out), translate var(--dur) var(--ease-out);
}
.stage-swap-leave-active {
  transition: opacity var(--dur-fast) ease-in, translate var(--dur-fast) ease-in;
}
.stage-swap-enter-from {
  opacity: 0;
  translate: 0 6px;
}
.stage-swap-leave-to {
  opacity: 0;
  translate: 0 -4px;
}
@media (max-width: 1060px) {
  .body {
    flex-direction: column;
  }
  .side {
    flex: none;
  }
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
