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

<script setup lang="ts" generic="T extends string | number, Multiple extends boolean = false">
import { computed, nextTick, onDeactivated, ref, watch } from "vue";
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
    multiple?: Multiple & boolean;
    summary?: string;
    /** 原生模态框内传入 dialog 元素，菜单随它进入顶层。 */
    teleportTo?: string | HTMLElement;
  }>(),
  { placeholder: undefined, searchable: undefined, menuWidth: 0, size: "md" },
);
const { t } = useI18n();
type Selection = Multiple extends true ? T[] : T;
const model = defineModel<Selection>({ required: true });

const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLDivElement>();
const list = ref<HTMLDivElement>();
const { open, style, toggle, close } = usePopover(trigger, panel, { minWidth: props.menuWidth, maxHeight: 320, ignoreEscape: () => Boolean(props.teleportTo) });
const isSelected = (value: T) => props.multiple ? (model.value as T[]).includes(value) : model.value === value;

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

const scrollToActive = () => list.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)?.scrollIntoView?.({ block: "nearest" });

const pick = (o: SelectOption<T>) => {
  if (props.multiple) {
    const values = model.value as T[];
    model.value = (values.includes(o.value) ? values.filter(value => value !== o.value) : [...values, o.value]) as Selection;
    return;
  }
  model.value = o.value as Selection;
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
  if (e.key === "Escape") {
    e.preventDefault(); e.stopPropagation(); close(); trigger.value?.focus();
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
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
onDeactivated(close);
defineExpose({ close, isOpen: open });
</script>

<template>
  <button v-bind="$attrs" ref="trigger" type="button" class="app-select select-trigger" :class="[size, { open }]" :aria-expanded="open" aria-haspopup="listbox" @click="toggle" @keydown="onKeydown">
    <span class="label" :class="{ placeholder: !selected && !summary }">{{ summary ?? selected?.label ?? placeholder ?? t("common.select") }}</span>
    <ChevronDown :size="14" class="chevron" />
  </button>

  <Teleport :to="teleportTo ?? 'body'">
    <Transition name="pop">
      <div v-if="open" ref="panel" class="select-menu" :style="style" @keydown="onKeydown">
        <label v-if="showSearch" class="search">
          <Search :size="13" />
          <input ref="searchInput" v-model="query" :placeholder="t('common.search')" spellcheck="false" />
        </label>
        <div ref="list" class="options" role="listbox" :aria-multiselectable="multiple || undefined">
          <template v-for="(o, i) in filtered" :key="`${o.group ?? ''}-${o.value}`">
            <div v-if="showGroup(i)" class="group">{{ o.group }}</div>
            <div
              class="option"
              role="option"
              :data-index="i"
              :data-value="o.value"
              :aria-selected="isSelected(o.value)"
              :class="{ active: i === active, selected: isSelected(o.value) }"
              @mouseenter="active = i"
              @click="pick(o)"
            >
              <span class="text">{{ o.label }}</span>
              <span v-if="o.hint" class="hint">{{ o.hint }}</span>
              <Check v-if="isSelected(o.value)" :size="13" class="check" aria-hidden="true" />
            </div>
          </template>
          <p v-if="!filtered.length" class="empty">{{ t("common.noOptions") }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
