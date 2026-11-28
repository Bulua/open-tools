<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, X } from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";
import { useStoredRef } from "@/composables/useStoredRef";
import { useToolResult } from "@/composables/useToolUsage";
import { boxOf, glide } from "@/utils/motion";
import { QUANTITIES, convertUnit, formatNumber, quantityLabel, unitLabel } from "./units";

/** 温度及常用单位换算：左侧选择数值、源单位与物理量，右侧多列网格展示所有换算结果 */
const { t } = useI18n();
const quantityId = useStoredRef("units.quantity", "temperature");
const quantity = computed(() => QUANTITIES.find((q) => q.id === quantityId.value) ?? QUANTITIES[0]);

const input = ref("100");
const from = ref(quantity.value.default);
const catListRef = ref<HTMLDivElement>();

watch(quantity, (q) => {
  if (!q.units.some((u) => u.id === from.value)) from.value = q.default;
});

const value = computed(() => {
  const v = Number(input.value.trim().replace(/,/g, ""));
  return input.value.trim() && Number.isFinite(v) ? v : null;
});

const items = computed(() =>
  quantity.value.units
    .filter((u) => u.id !== from.value)
    .map((u) => ({
      id: u.id,
      label: unitLabel(quantity.value, u),
      value: value.value === null ? "" : formatNumber(convertUnit(quantity.value, value.value, from.value, u.id)),
    })),
);

const fromLabel = computed(() => {
  const u = quantity.value.units.find((x) => x.id === from.value);
  return u ? unitLabel(quantity.value, u) : "";
});

const selectQuantity = (id: string, event: MouseEvent) => {
  if (quantityId.value === id) return;
  const list = catListRef.value;
  const previous = list?.querySelector<HTMLElement>(".cat-btn.on");
  const next = event.currentTarget as HTMLElement | null;
  if (list && previous && next && previous !== next && typeof list.animate === "function") {
    glide(list, boxOf(previous), boxOf(next), "unit-cat");
  }
  quantityId.value = id;
};

const { copy } = useClipboard();
const copiedId = ref<string | null>(null);
const copyUnit = async (id: string, val: string) => {
  if (!val) return;
  await copy(val);
  copiedId.value = id;
  setTimeout(() => {
    if (copiedId.value === id) copiedId.value = null;
  }, 1200);
};

useToolResult(() => (value.value !== null ? `${input.value}|${from.value}|${quantityId.value}` : ""));
</script>

<template>
  <div class="units-workbench">
    <aside class="card sidebar">
      <section class="section">
        <h3>{{ t("convert.input") }}</h3>
        <div class="input-box">
          <input
            v-model="input"
            class="field big"
            :class="{ invalid: input.trim() && value === null }"
            inputmode="decimal"
            spellcheck="false"
            :placeholder="t('convert.inputValue')"
          />
          <button
            v-if="input"
            type="button"
            class="icon-btn clear-input"
            :title="t('convert.clearUnit')"
            @click="input = ''"
          >
            <X :size="14" />
          </button>
        </div>
        <p v-if="input.trim() && value === null" class="error">{{ t("convert.enterNumber") }}</p>

        <div class="quick-row">
          <button
            v-for="n in ['0', '1', '10', '100', '1000']"
            :key="n"
            type="button"
            class="quick-pill"
            :class="{ on: input.trim() === n }"
            @click="input = n"
          >
            {{ n }}
          </button>
        </div>

        <h3>{{ t("convert.sourceUnit") }}</h3>
        <div class="unit-list">
          <button
            v-for="u in quantity.units"
            :key="u.id"
            type="button"
            class="unit"
            :class="{ on: from === u.id }"
            @click="from = u.id"
          >
            {{ unitLabel(quantity, u) }}
          </button>
        </div>
      </section>

      <section class="section cat-section">
        <h3>{{ t("convert.category") }}</h3>
        <div ref="catListRef" class="cat-list">
          <button
            v-for="q in QUANTITIES"
            :key="q.id"
            type="button"
            class="cat-btn"
            :class="{ on: quantityId === q.id }"
            @click="selectQuantity(q.id, $event)"
          >
            {{ quantityLabel(q) }}
          </button>
        </div>
      </section>
    </aside>

    <main class="card stage">
      <header class="card-title">
        <span>{{ t("convert.results") }}</span>
        <span v-if="value !== null" class="equals-pill">{{ t("convert.equals", { value: formatNumber(value), unit: fromLabel }) }}</span>
      </header>

      <Transition name="stage-swap" mode="out-in">
        <div :key="`${quantityId}:${from}`" class="result-scroll">
          <div class="result-grid">
            <button
              v-for="item in items"
              :key="item.id"
              type="button"
              class="result-tile"
              :class="{ copied: copiedId === item.id, empty: !item.value }"
              :disabled="!item.value"
              @click="copyUnit(item.id, item.value)"
            >
              <div class="tile-head">
                <span class="tile-label">{{ item.label }}</span>
                <span class="tile-copy">
                  <Check v-if="copiedId === item.id" :size="13" />
                  <Copy v-else :size="13" />
                </span>
              </div>
              <code class="tile-value">{{ item.value || "—" }}</code>
            </button>
          </div>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.units-workbench {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.sidebar {
  flex: 0 0 300px;
  min-height: 0;
  box-shadow: var(--shadow-sm);
}
.sidebar h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.input-box {
  position: relative;
}
.field.big {
  height: 40px;
  padding-right: 32px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 18px;
}
.clear-input {
  position: absolute;
  right: 6px;
  top: 7px;
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.quick-pill {
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11.5px;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.quick-pill:hover,
.quick-pill.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.unit-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 146px;
  overflow-y: auto;
}
.unit {
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 12px;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.unit:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.unit.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}
.cat-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.cat-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 4px;
  padding-right: 2px;
}
.cat-list.gliding .cat-btn.on {
  background: transparent;
  border-color: transparent;
}
.cat-list :deep(.glide-unit-cat) {
  border-radius: 7px;
  background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}
.cat-btn {
  position: relative;
  z-index: 1;
  height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.cat-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.cat-btn.on {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--accent);
  font-weight: 500;
}

.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-shadow: var(--shadow-sm);
}
.equals-pill {
  margin-left: auto;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  max-width: 65%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}
.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
  gap: 10px;
  align-content: start;
}
.result-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-sunken);
  text-align: left;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.result-tile:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface);
}
.result-tile.copied {
  border-color: color-mix(in srgb, var(--success) 42%, transparent);
  background: var(--success-soft);
}
.result-tile.empty {
  cursor: default;
  opacity: 0.6;
}
.tile-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tile-label {
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile-copy {
  flex-shrink: 0;
  color: var(--text-3);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.result-tile:hover:not(:disabled) .tile-copy,
.result-tile.copied .tile-copy {
  opacity: 1;
}
.result-tile.copied .tile-copy {
  color: var(--success);
}
.tile-value {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  word-break: break-all;
  user-select: text;
}
.stage-swap-enter-active {
  transition: opacity var(--dur) var(--ease-out), translate var(--dur) var(--ease-out);
}
.stage-swap-leave-active {
  transition: opacity var(--dur-fast) ease-in, translate var(--dur-fast) ease-in;
}
.stage-swap-enter-from {
  opacity: 0;
  translate: 0 5px;
}
.stage-swap-leave-to {
  opacity: 0;
  translate: 0 -4px;
}
@media (max-width: 860px) {
  .units-workbench {
    flex: none;
    width: 100%;
    flex-direction: column;
  }
  .sidebar {
    flex: none;
  }
  .cat-list {
    max-height: 180px;
  }
}
</style>
