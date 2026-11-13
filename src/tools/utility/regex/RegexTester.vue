<script setup lang="ts">
import { useToolUsage } from "@/composables/useToolUsage";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { locale, translationOf } from "@/locales";
import { CircleAlert } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useClipboard } from "@/composables/useClipboard";
import { PRESETS, type RegexResult } from "./regex";

const { t } = useI18n();
/**
 * 正则表达式测试：实时高亮匹配、列出分组、预览替换结果。
 * 匹配在后台线程中执行，超时（多半是灾难性回溯）会自动中止，界面不会卡死。
 */
const pattern = useStoredRef("regex.pattern", "(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})");
const flags = useStoredRef("regex.flags", "g");
const text = ref(t("utility.sampleText"));
const replacement = ref("");
const useReplace = ref(false);

const FLAGS = computed(() => ["g", "i", "m", "s", "u"].map((flag) => ({ flag, title: t(`utility.flag${flag.toUpperCase()}`) })));
const toggleFlag = (f: string) => {
  flags.value = flags.value.includes(f) ? flags.value.replace(f, "") : "gimsuy".split("").filter((x) => x === f || flags.value.includes(x)).join("");
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

const createWorker = () => {
  worker = new Worker(new URL("./regex.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; result: RegexResult }>) => {
    if (e.data.id !== requestId) return; // 过期的结果
    clearTimeout(timer);
    running.value = false;
    timedOut.value = false;
    result.value = e.data.result;
    if (userEdited && result.value.ok && pattern.value && text.value) trackUsage();
    else cancelUsage();
  };
};
createWorker();
onBeforeUnmount(() => worker?.terminate());

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
      // 超时：结束这个线程，换一个新的
      if (id !== requestId) return;
      worker!.terminate();
      createWorker();
      running.value = false;
      timedOut.value = true;
      result.value = { ok: true, matches: [], truncated: false };
    }, TIMEOUT);
  }, 120);
};
watch([pattern, flags, text, replacement, useReplace], () => { userEdited = true; run(); });
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

const applyPreset = (p: (typeof PRESETS)[number]) => {
  pattern.value = p.pattern;
  if (p.flags) flags.value = p.flags;
};

const { copy } = useClipboard();
const show = (s: string | undefined) => (s === undefined ? t("utility.unmatched") : s === "" ? t("utility.empty") : s);
</script>

<template>
  <div class="regex">
    <!-- 正则输入栏 -->
    <section class="card pattern-bar" :class="{ invalid: !result.ok || timedOut }">
      <div class="pattern-row">
        <span class="slash">/</span>
        <input v-model="pattern" class="pattern" spellcheck="false" :placeholder="t('utility.regexPlaceholder')" />
        <span class="slash">/</span>
        <div class="flags">
          <button v-for="f in FLAGS" :key="f.flag" :class="{ on: flags.includes(f.flag) }" :title="f.title" @click="toggleFlag(f.flag)">
            {{ f.flag }}
          </button>
        </div>
        <button class="btn small subtle" :title="t('utility.copyRegex')" @click="copy(`/${pattern}/${flags}`)">{{ t("utility.copy") }}</button>
      </div>
      <div class="presets">
        <span class="label">{{ t("utility.common") }}</span>
        <button v-for="p in PRESETS" :key="p.label" class="preset" :title="p.pattern" @click="applyPreset(p)">{{ translationOf(p.i18n, locale) ?? p.label }}</button>
      </div>
      <p v-if="!result.ok" class="error"><CircleAlert :size="14" />{{ t("utility.syntaxError", { error: result.error }) }}</p>
      <p v-else-if="timedOut" class="error">
        <CircleAlert :size="14" />{{ t("utility.timeout", { n: TIMEOUT / 1000 }) }}
      </p>
    </section>

    <div class="body">
      <TextPane v-model="text" class="text" :label="t('utility.testText')" language="text" :code-marks="marks" :placeholder="t('utility.testPlaceholder')">
        <template #actions>
          <span class="count" :class="{ zero: !result.matches.length }">{{ running ? t("utility.running") : summary }}</span>
        </template>
      </TextPane>

      <div class="side">
        <section class="card matches">
          <div class="card-title">{{ t("utility.matchResults") }}</div>
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
          <p v-else class="empty">{{ summary }}</p>
        </section>

        <section class="card replace">
          <header class="card-title">
            <label class="check"><input v-model="useReplace" type="checkbox" />{{ t("utility.replace") }}</label>
            <span class="hint">{{ t("utility.replaceHint") }}</span>
          </header>
          <template v-if="useReplace">
            <div class="replace-input">
              <input v-model="replacement" class="field mono" spellcheck="false" :placeholder="t('utility.replacePlaceholder')" />
            </div>
            <TextPane :model-value="result.replaced ?? ''" class="replaced" :label="t('utility.replaced')" readonly />
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.regex {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ---------- 正则输入栏 ---------- */
.pattern-bar {
  flex-shrink: 0;
  padding: 10px 12px;
  gap: 8px;
  transition: border-color 0.15s;
}
.pattern-bar.invalid {
  border-color: var(--danger);
}
.pattern-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.slash {
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--text-3);
}
.pattern {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: none;
  outline: none;
  background: none;
  font-family: var(--font-mono);
  font-size: 15px;
}
.flags {
  display: flex;
  gap: 2px;
}
.flags button {
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-3);
}
.flags button:hover {
  background: var(--hover);
}
.flags button.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.label {
  font-size: 12px;
  color: var(--text-3);
}
.preset {
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: none;
  font-size: 12px;
  color: var(--text-2);
}
.preset:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.error {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ---------- 文本与结果 ---------- */
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.text {
  flex: 1;
  min-height: 300px;
}
.count {
  margin-right: 6px;
  padding: 1px 8px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  white-space: nowrap;
}
.count.zero {
  background: var(--active);
  color: var(--text-3);
}
.side {
  flex: 0 0 360px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.matches {
  flex: 1;
  min-height: 160px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
}
.match {
  padding: 8px 10px;
  border-radius: 8px;
}
.match + .match {
  border-top: 1px solid var(--border);
}
.match.active {
  background: var(--hover);
}
.match-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.no {
  flex-shrink: 0;
  min-width: 20px;
  font-size: 11px;
  color: var(--text-3);
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
  margin: 6px 0 0 28px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.group {
  display: flex;
  gap: 8px;
  font-size: 12px;
}
.group-name {
  flex-shrink: 0;
  min-width: 72px;
  color: var(--accent);
  font-family: var(--font-mono);
}
.group code {
  font-family: var(--font-mono);
  word-break: break-all;
  user-select: text;
}
.empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-3);
}
.replace {
  flex-shrink: 0;
}
.hint {
  margin-left: auto;
  padding-right: 6px;
  font-weight: 400;
  color: var(--text-3);
}
.replace-input {
  padding: 10px 12px 0;
}
.field.mono {
  height: 32px;
}
.replaced {
  margin: 10px 12px 12px;
  min-height: 110px;
  max-height: 200px;
}
@media (max-width: 1100px) {
  .body {
    flex-direction: column;
  }
  .side {
    flex: none;
  }
}
</style>
