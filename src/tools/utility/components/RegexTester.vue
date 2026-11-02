<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { CircleAlert } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useClipboard } from "@/composables/useClipboard";
import { PRESETS, type RegexResult } from "../regex";

/**
 * 正则表达式测试：实时高亮匹配、列出分组、预览替换结果。
 * 匹配在后台线程中执行，超时（多半是灾难性回溯）会自动中止，界面不会卡死。
 */
const pattern = useStoredRef("regex.pattern", "(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})");
const flags = useStoredRef("regex.flags", "g");
const text = ref("会议安排：2024-03-15 产品评审，2024-04-02 版本发布。\n联系人：tom@example.com，电话 13812345678");
const replacement = ref("");
const useReplace = ref(false);

const FLAGS = [
  { flag: "g", title: "全局：找出所有匹配" },
  { flag: "i", title: "忽略大小写" },
  { flag: "m", title: "多行：^ $ 匹配每一行的开头结尾" },
  { flag: "s", title: "点号匹配换行" },
  { flag: "u", title: "Unicode 模式" },
];
const toggleFlag = (f: string) => {
  flags.value = flags.value.includes(f) ? flags.value.replace(f, "") : "gimsuy".split("").filter((x) => x === f || flags.value.includes(x)).join("");
};

// ---------- 后台线程 ----------
const TIMEOUT = 1500;
let worker: Worker | null = null;
let requestId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const result = ref<RegexResult>({ ok: true, matches: [], truncated: false });
const timedOut = ref(false);
const running = ref(false);

const createWorker = () => {
  worker = new Worker(new URL("../regex.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; result: RegexResult }>) => {
    if (e.data.id !== requestId) return; // 过期的结果
    clearTimeout(timer);
    running.value = false;
    timedOut.value = false;
    result.value = e.data.result;
  };
};
createWorker();
onBeforeUnmount(() => worker?.terminate());

let debounce: ReturnType<typeof setTimeout> | undefined;
const run = () => {
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
watch([pattern, flags, text, replacement, useReplace], run, { immediate: true });

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
  if (!pattern.value) return "输入正则表达式开始匹配";
  if (!n) return "没有匹配";
  return `${n}${result.value.truncated ? "+" : ""} 处匹配`;
});

const applyPreset = (p: (typeof PRESETS)[number]) => {
  pattern.value = p.pattern;
  if (p.flags) flags.value = p.flags;
};

const { copy } = useClipboard();
const show = (s: string | undefined) => (s === undefined ? "（未匹配）" : s === "" ? "（空）" : s);
</script>

<template>
  <div class="regex">
    <!-- 正则输入栏 -->
    <section class="card pattern-bar" :class="{ invalid: !result.ok || timedOut }">
      <div class="pattern-row">
        <span class="slash">/</span>
        <input v-model="pattern" class="pattern" spellcheck="false" placeholder="在这里输入正则表达式" />
        <span class="slash">/</span>
        <div class="flags">
          <button v-for="f in FLAGS" :key="f.flag" :class="{ on: flags.includes(f.flag) }" :title="f.title" @click="toggleFlag(f.flag)">
            {{ f.flag }}
          </button>
        </div>
        <button class="btn small subtle" title="复制正则" @click="copy(`/${pattern}/${flags}`)">复制</button>
      </div>
      <div class="presets">
        <span class="label">常用</span>
        <button v-for="p in PRESETS" :key="p.label" class="preset" :title="p.pattern" @click="applyPreset(p)">{{ p.label }}</button>
      </div>
      <p v-if="!result.ok" class="error"><CircleAlert :size="14" />语法错误：{{ result.error }}</p>
      <p v-else-if="timedOut" class="error">
        <CircleAlert :size="14" />匹配超过 {{ TIMEOUT / 1000 }} 秒已中止，这个表达式可能存在灾难性回溯（例如 (a+)+ 这类嵌套重复）
      </p>
    </section>

    <div class="body">
      <TextPane v-model="text" class="text" label="测试文本" language="text" :code-marks="marks" placeholder="粘贴要匹配的文本">
        <template #actions>
          <span class="count" :class="{ zero: !result.matches.length }">{{ running ? "匹配中…" : summary }}</span>
        </template>
      </TextPane>

      <div class="side">
        <section class="card matches">
          <div class="card-title">匹配结果</div>
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
            <label class="check"><input v-model="useReplace" type="checkbox" />替换</label>
            <span class="hint">可以用 $1、$&lt;name&gt; 引用分组</span>
          </header>
          <template v-if="useReplace">
            <div class="replace-input">
              <input v-model="replacement" class="field mono" spellcheck="false" placeholder="替换为，例如 $<month>/$<day>/$<year>" />
            </div>
            <TextPane :model-value="result.replaced ?? ''" class="replaced" label="替换结果" readonly />
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
