<script lang="ts">
export interface SelectOption<T = string | number> {
  value: T;
  label: string;
  /** 右侧的灰色说明 */
  hint?: string;
  /** 分组名，相邻的同组选项显示在同一个标题下 */
  group?: string;
}
</script>

<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, ref, watch } from "vue";
import { Check, ChevronDown, Search } from "lucide-vue-next";
import { usePopover } from "@/composables/usePopover";
import { useI18n } from "vue-i18n";

// 弹出层用 Teleport 放在 body 下，组件有两个根节点；class 等属性交给触发按钮
defineOptions({ inheritAttrs: false });

/**
 * 下拉选择框：替代系统自带的 select，样式与程序一致。
 * 选项多时自动显示搜索框；支持方向键、回车、Esc 操作。
 */
const props = withDefaults(
  defineProps<{
    options: SelectOption<T>[];
    placeholder?: string;
    /** 是否显示搜索框，默认选项超过 12 个时显示 */
    searchable?: boolean;
    /** 弹出层最小宽度 */
    menuWidth?: number;
    size?: "sm" | "md";
  }>(),
  { placeholder: undefined, searchable: undefined, menuWidth: 0, size: "md" },
);
const { t } = useI18n();
const model = defineModel<T>({ required: true });

const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLDivElement>();
const list = ref<HTMLDivElement>();
const { open, style, toggle, close } = usePopover(trigger, panel, { minWidth: props.menuWidth, maxHeight: 320 });

const selected = computed(() => props.options.find((o) => o.value === model.value));
const showSearch = computed(() => props.searchable ?? props.options.length > 12);
const query = ref("");
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? props.options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.value}`.toLowerCase().includes(q)) : props.options;
});

const active = ref(-1);
const searchInput = ref<HTMLInputElement>();

watch(open, async (isOpen) => {
  if (!isOpen) return;
  query.value = "";
  active.value = filtered.value.findIndex((o) => o.value === model.value);
  await nextTick();
  searchInput.value?.focus();
  scrollToActive();
});
watch(query, () => (active.value = filtered.value.length ? 0 : -1));

const scrollToActive = () => list.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)?.scrollIntoView({ block: "nearest" });

const pick = (o: SelectOption<T>) => {
  model.value = o.value;
  close();
  trigger.value?.focus();
};

const onKeydown = (e: KeyboardEvent) => {
  if (!open.value) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      toggle();
    }
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const n = filtered.value.length;
    if (!n) return;
    active.value = (active.value + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    scrollToActive();
  } else if (e.key === "Enter") {
    e.preventDefault();
    const o = filtered.value[active.value];
    if (o) pick(o);
  } else if (e.key === "Tab") close();
};

/** 分组标题只在每组第一个选项前显示 */
const showGroup = (i: number) => {
  const g = filtered.value[i].group;
  return !!g && (i === 0 || filtered.value[i - 1].group !== g);
};
</script>

<template>
  <button v-bind="$attrs" ref="trigger" type="button" class="app-select" :class="[size, { open }]" @click="toggle" @keydown="onKeydown">
    <span class="label" :class="{ placeholder: !selected }">{{ selected?.label ?? placeholder ?? t("common.select") }}</span>
    <ChevronDown :size="14" class="chevron" />
  </button>

  <Teleport to="body">
    <Transition name="pop">
      <div v-if="open" ref="panel" class="select-menu" :style="style" @keydown="onKeydown">
        <label v-if="showSearch" class="search">
          <Search :size="13" />
          <input ref="searchInput" v-model="query" :placeholder="t('common.search')" spellcheck="false" />
        </label>
        <div ref="list" class="options" role="listbox">
          <template v-for="(o, i) in filtered" :key="`${o.group ?? ''}-${o.value}`">
            <div v-if="showGroup(i)" class="group">{{ o.group }}</div>
            <div
              class="option"
              role="option"
              :data-index="i"
              :aria-selected="o.value === model"
              :class="{ active: i === active, selected: o.value === model }"
              @mouseenter="active = i"
              @click="pick(o)"
            >
              <span class="text">{{ o.label }}</span>
              <span v-if="o.hint" class="hint">{{ o.hint }}</span>
              <Check v-if="o.value === model" :size="13" class="check" />
            </div>
          </template>
          <p v-if="!filtered.length" class="empty">{{ t("common.noOptions") }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.app-select.sm {
  height: 28px;
  padding: 0 8px 0 10px;
  border-radius: 6px;
  font-size: 12.5px;
}
.app-select:hover {
  border-color: var(--text-3);
}
.app-select:focus-visible,
.app-select.open {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.placeholder {
  color: var(--text-3);
}
.chevron {
  flex-shrink: 0;
  color: var(--text-3);
  transition: transform 0.15s;
}
.open .chevron {
  transform: rotate(180deg);
}
</style>

<style>
/* 弹出层放在 body 下，不能用 scoped */
.select-menu {
  position: fixed;
  z-index: 100;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.select-menu .search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 2px 4px;
  padding: 0 8px;
  height: 30px;
  border-radius: 7px;
  background: var(--bg-sunken);
  color: var(--text-3);
}
.select-menu .search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  color: var(--text);
  font-size: 13px;
}
.select-menu .options {
  max-height: 300px;
  overflow: auto;
}
.select-menu .group {
  padding: 8px 10px 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-3);
}
.select-menu .option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 30px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.select-menu .option.active {
  background: var(--hover);
}
.select-menu .option.selected {
  color: var(--accent);
  font-weight: 500;
}
.select-menu .option .text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select-menu .option .hint {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-3);
}
.select-menu .empty {
  margin: 0;
  padding: 12px 10px;
  font-size: 12px;
  color: var(--text-3);
}
</style>
