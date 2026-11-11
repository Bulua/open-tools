<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import TextPane from "@/components/common/TextPane.vue";
import { describeError, diffJson, editorErrorOf, parseJson, preview, type DiffKind, type ParseResult } from "../utils";

const { t } = useI18n();
const left = ref("");
const right = ref("");

const parse = (text: string) => (text.trim() ? parseJson(text) : null);
const leftResult = computed(() => parse(left.value));
const rightResult = computed(() => parse(right.value));

const errorOf = (r: ParseResult | null, side: "leftSide" | "rightSide") => (r && !r.ok ? t(`json.${side}`, { error: describeError(r) }) : "");

const error = computed(() =>
  [errorOf(leftResult.value, "leftSide"), errorOf(rightResult.value, "rightSide")].filter(Boolean).join("\n"),
);

const diffs = computed(() => {
  const a = leftResult.value;
  const b = rightResult.value;
  return a?.ok && b?.ok ? diffJson(a.value, b.value) : null;
});

const count = (kind: DiffKind) => diffs.value?.filter((d) => d.kind === kind).length ?? 0;


useToolResult(() => diffs.value ? `${left.value}\0${right.value}` : "");
</script>

<template>
  <div class="json-diff">
    <div class="panes">
      <TextPane
        v-model="left"
        :label="t('json.diffLeft')"
        language="json"
        :code-error="editorErrorOf(leftResult)"
        :placeholder="t('json.diffLeftPlaceholder')"
      />
      <TextPane
        v-model="right"
        :label="t('json.diffRight')"
        language="json"
        :code-error="editorErrorOf(rightResult)"
        :placeholder="t('json.diffRightPlaceholder')"
      />
    </div>

    <section class="card result">
      <header class="card-title">
        <span class="title">{{ t("json.diffResult") }}</span>
        <template v-if="diffs">
          <span class="chip added">{{ t("json.added") }} {{ count("added") }}</span>
          <span class="chip removed">{{ t("json.removed") }} {{ count("removed") }}</span>
          <span class="chip changed">{{ t("json.changed") }} {{ count("changed") }}</span>
        </template>
      </header>

      <p v-if="error" class="message error">{{ error }}</p>
      <p v-else-if="!diffs" class="message">{{ t("json.diffHint") }}</p>
      <p v-else-if="!diffs.length" class="message same">{{ t("json.diffSame") }}</p>
      <ul v-else class="list">
        <li v-for="d in diffs" :key="d.path + d.kind" class="item">
          <span class="kind" :class="d.kind">{{ t(`json.${d.kind}`) }}</span>
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
}
.title {
  margin-right: 4px;
}
.chip {
  font-size: 12px;
  font-weight: 400;
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
  padding: 12px 16px 14px;
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
  padding: 6px 8px 8px;
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

@media (max-width: 720px) {
  .json-diff {
    flex: none;
    width: 100%;
    min-height: auto;
    gap: 12px;
  }
  .panes {
    flex: none;
    width: 100%;
    flex-direction: column;
    gap: 12px;
  }
  .panes > :deep(.pane) {
    flex: none;
    min-height: 240px;
  }
  .result {
    flex: none;
    min-height: 220px;
  }
  .card-title {
    flex-wrap: wrap;
  }
  .item {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 5px 8px;
    padding: 7px 8px;
  }
  .path {
    max-width: calc(100% - 64px);
  }
  .values {
    flex-basis: 100%;
    padding-left: 0;
  }
}
</style>
