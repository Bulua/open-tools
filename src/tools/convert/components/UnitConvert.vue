<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import CopyList from "@/components/common/CopyList.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { QUANTITIES, convertUnit, formatNumber, quantityLabel, unitLabel } from "../units";

/** 温度及常用单位换算：输入一个值，一次显示所有单位的结果 */
const { t } = useI18n();
const quantityId = useStoredRef("units.quantity", "temperature");
const quantity = computed(() => QUANTITIES.find((q) => q.id === quantityId.value) ?? QUANTITIES[0]);

const input = ref("100");
const from = ref(quantity.value.default);
// 切换类别时换成该类别的默认单位
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
      label: unitLabel(quantity.value, u),
      value: value.value === null ? "" : formatNumber(convertUnit(quantity.value, value.value, from.value, u.id)),
    })),
);

const fromLabel = computed(() => {
  const u = quantity.value.units.find((x) => x.id === from.value);
  return u ? unitLabel(quantity.value, u) : "";
});
</script>

<template>
  <nav class="quantities">
    <button v-for="q in QUANTITIES" :key="q.id" :class="{ on: quantityId === q.id }" @click="quantityId = q.id">{{ quantityLabel(q) }}</button>
  </nav>

  <div class="units">
    <section class="card">
      <div class="card-title">{{ t("convert.input") }}</div>
      <div class="body">
        <input
          v-model="input"
          class="field big"
          :class="{ invalid: input.trim() && value === null }"
          inputmode="decimal"
          spellcheck="false"
          :placeholder="t('convert.inputValue')"
        />
        <div class="unit-list">
          <button v-for="u in quantity.units" :key="u.id" class="unit" :class="{ on: from === u.id }" @click="from = u.id">
            {{ unitLabel(quantity, u) }}
          </button>
        </div>
        <p v-if="input.trim() && value === null" class="error">{{ t("convert.enterNumber") }}</p>
      </div>
    </section>

    <section class="card">
      <div class="card-title">
        {{ t("convert.results") }}
        <span v-if="value !== null" class="hint">{{ t("convert.equals", { value: formatNumber(value), unit: fromLabel }) }}</span>
      </div>
      <CopyList :items="items" label-width="150px" />
    </section>
  </div>
</template>

<style scoped>
.quantities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.quantities button {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--surface);
  font-size: 13px;
  color: var(--text-2);
}
.quantities button:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.quantities button.on {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.units {
  display: grid;
  grid-template-columns: minmax(280px, 2fr) minmax(0, 3fr);
  align-items: start;
  gap: 14px;
}
@media (max-width: 1000px) {
  .units {
    grid-template-columns: 1fr;
  }
}
.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
}
.field.big {
  height: 44px;
  font-family: var(--font-mono);
  font-size: 20px;
}
/* 单位用一组按钮选择，比下拉框更直观 */
.unit-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.unit {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
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
.hint {
  margin-left: auto;
  padding-right: 6px;
  font-weight: 400;
  color: var(--text-3);
}
</style>
