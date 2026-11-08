<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { useI18n } from "vue-i18n";

/**
 * 左右分栏：两侧拼在同一个面板里，拖动中间的分隔线调整宽度，双击分隔线恢复默认。
 * 放进来的 TextPane 会去掉各自的边框和圆角，看起来是一个整体。
 * 宽度比例按 storageKey 记住。
 */
const props = withDefaults(
  defineProps<{
    storageKey: string;
    /** 左侧默认占比（0～1） */
    defaultRatio?: number;
    /** 每一侧的最小宽度（像素） */
    min?: number;
  }>(),
  { defaultRatio: 0.4, min: 220 },
);
const { t } = useI18n();

const ratio = useStoredRef(`split.${props.storageKey}`, props.defaultRatio);
const root = ref<HTMLDivElement>();
const dragging = ref(false);

const clamp = (value: number) => {
  const width = root.value?.clientWidth ?? 0;
  if (!width) return value;
  const min = Math.min(props.min / width, 0.45);
  return Math.min(1 - min, Math.max(min, value));
};

const onMove = (e: PointerEvent) => {
  const rect = root.value!.getBoundingClientRect();
  ratio.value = clamp((e.clientX - rect.left) / rect.width);
};
const stop = () => {
  dragging.value = false;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", stop);
  document.body.classList.remove("resizing-col");
};
const start = (e: PointerEvent) => {
  e.preventDefault();
  dragging.value = true;
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", stop);
  document.body.classList.add("resizing-col");
};
onBeforeUnmount(stop);

/** 键盘也可以调整：左右方向键 */
const onKey = (e: KeyboardEvent) => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    ratio.value = clamp(ratio.value + (e.key === "ArrowLeft" ? -0.02 : 0.02));
  }
};
</script>

<template>
  <div ref="root" class="split" :class="{ dragging }" :style="{ '--left': `${ratio * 100}%` }">
    <div class="side left"><slot name="left" /></div>
    <div
      class="divider"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :title="t('common.splitDrag')"
      @pointerdown="start"
      @dblclick="ratio = defaultRatio"
      @keydown="onKey"
    />
    <div class="side right"><slot name="right" /></div>
  </div>
</template>

<style scoped>
.split {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.side {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.left {
  flex: 0 0 var(--left);
}
.right {
  flex: 1;
}
/* 拼在一起的面板：去掉各自的边框、圆角 */
.side > :deep(.pane) {
  flex: 1;
  border: none;
  border-radius: 0;
}
/* 分隔线：1px 细线，左右各有 4px 的拖动区域 */
.divider {
  position: relative;
  flex: 0 0 1px;
  background: var(--border);
  cursor: col-resize;
  outline: none;
  z-index: 1;
}
.divider::before {
  content: "";
  position: absolute;
  inset: 0 -4px;
}
.divider::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -1px;
  width: 3px;
  background: var(--accent);
  opacity: 0;
  transition: opacity 0.15s;
}
.divider:hover::after,
.divider:focus-visible::after,
.dragging .divider::after {
  opacity: 1;
}
.dragging {
  cursor: col-resize;
}

@media (max-width: 720px) {
  .split {
    flex: none;
    width: 100%;
    flex-direction: column;
    gap: 12px;
    overflow: visible;
    border: none;
    background: none;
  }
  .side,
  .left,
  .right {
    flex: none;
    width: 100%;
    min-height: 280px;
  }
  .side > :deep(.pane) {
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .divider {
    display: none;
  }
}
</style>

<style>
/* 拖动时整个页面都显示调整光标，不选中文字 */
body.resizing-col,
body.resizing-col * {
  cursor: col-resize !important;
  user-select: none !important;
}
</style>
