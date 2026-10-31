<script setup lang="ts">
import { computed, ref } from "vue";
import TextPane from "@/components/common/TextPane.vue";
import { describeError, diffJson, editorErrorOf, parseJson, preview, type DiffKind, type ParseResult } from "../utils";

const left = ref("");
const right = ref("");

const parse = (text: string) => (text.trim() ? parseJson(text) : null);
const leftResult = computed(() => parse(left.value));
const rightResult = computed(() => parse(right.value));

const errorOf = (r: ParseResult | null, side: string) => (r && !r.ok ? `${side} ${describeError(r)}` : "");

const error = computed(() =>
  [errorOf(leftResult.value, "左侧"), errorOf(rightResult.value, "右侧")].filter(Boolean).join("\n"),
);

const diffs = computed(() => {
  const a = leftResult.value;
  const b = rightResult.value;
  return a?.ok && b?.ok ? diffJson(a.value, b.value) : null;
});

const count = (kind: DiffKind) => diffs.value?.filter((d) => d.kind === kind).length ?? 0;

const KIND_LABEL: Record<DiffKind, string> = { added: "新增", removed: "删除", changed: "修改" };
</script>

<template>
  <div class="json-diff">
    <div class="panes">
      <TextPane
        v-model="left"
        label="原始 JSON（左）"
        language="json"
        :code-error="editorErrorOf(leftResult)"
        placeholder="粘贴修改前的 JSON"
      />
      <TextPane
        v-model="right"
        label="新 JSON（右）"
        language="json"
        :code-error="editorErrorOf(rightResult)"
        placeholder="粘贴修改后的 JSON"
      />
    </div>

    <section class="result">
      <header class="result-head">
        <span class="title">对比结果</span>
        <template v-if="diffs">
          <span class="chip added">新增 {{ count("added") }}</span>
          <span class="chip removed">删除 {{ count("removed") }}</span>
          <span class="chip changed">修改 {{ count("changed") }}</span>
        </template>
      </header>

      <p v-if="error" class="message error">{{ error }}</p>
      <p v-else-if="!diffs" class="message">在上方分别粘贴两段 JSON，差异会实时显示在这里。</p>
      <p v-else-if="!diffs.length" class="message same">两段 JSON 内容完全一致。</p>
      <ul v-else class="list">
        <li v-for="d in diffs" :key="d.path + d.kind" class="item">
          <span class="kind" :class="d.kind">{{ KIND_LABEL[d.kind] }}</span>
          <code class="path">{{ d.path }}</code>
          <span class="values">
            <code v-if="d.kind !== 'added'" class="before">{{ preview(d.before) }}</code>
            <span v-if="d.kind === 'changed'" class="arrow">→</span>
            <code v-if="d.kind !== 'removed'" class="after">{{ preview(d.after) }}</code>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.json-diff {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}
.panes {
  flex: 3;
  display: flex;
  gap: 14px;
  min-height: 0;
}
.result {
  flex: 2;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px 6px;
}
.title {
  font-size: 12px;
  color: var(--text-3);
  margin-right: 4px;
}
.chip {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 6px;
}
.chip.added,
.kind.added {
  color: var(--success);
  background: var(--success-soft);
}
.chip.removed,
.kind.removed {
  color: var(--danger);
  background: var(--danger-soft);
}
.chip.changed,
.kind.changed {
  color: var(--warning);
  background: var(--warning-soft);
}
.message {
  margin: 0;
  padding: 6px 16px 14px;
  font-size: 13px;
  color: var(--text-3);
  white-space: pre-wrap;
}
.message.error {
  color: var(--danger);
}
.message.same {
  color: var(--success);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0 8px 8px;
  overflow: auto;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 13px;
}
.item:hover {
  background: var(--hover);
}
.kind {
  flex-shrink: 0;
  font-size: 11px;
  padding: 0 6px;
  border-radius: 4px;
  line-height: 18px;
}
.path {
  flex-shrink: 0;
  max-width: 40%;
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}
.values {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}
.values code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}
.before {
  color: var(--text-3);
}
.kind ~ .values .before {
  text-decoration: line-through;
}
.after {
  color: var(--text);
}
.arrow {
  color: var(--text-3);
}
</style>
