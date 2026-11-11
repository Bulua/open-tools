<script setup lang="ts">
import { CircleAlert, Info } from "lucide-vue-next";
import { holdToast, releaseToast, toasts } from "@/utils/errorToast";
</script>

<template>
  <TransitionGroup name="toast" tag="div" class="toasts">
    <div v-for="e in toasts" :key="e.id" class="toast" :class="e.kind" :role="e.kind === 'error' ? 'alert' : 'status'" @mouseenter="holdToast(e.id)" @mouseleave="releaseToast(e.id)">
      <component :is="e.kind === 'error' ? CircleAlert : Info" :size="16" class="icon" />
      <p class="text">
        <b v-if="e.title">{{ e.title }}</b>
        {{ e.message }}
      </p>
    </div>
  </TransitionGroup>
</template>

<style scoped>
/* 顶栏高 52px，提示贴着顶栏下面；容器本身不挡鼠标 */
.toasts {
  position: fixed;
  top: 64px;
  left: 50%;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(520px, calc(100% - 48px));
  transform: translateX(-50%);
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 100%;
  padding: 10px 16px 10px 14px;
  border: 1px solid color-mix(in srgb, var(--danger) 28%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--danger) 6%, var(--surface));
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
}
.icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--danger);
}
.toast.notice {
  border-color: var(--border-strong);
  background: var(--surface);
}
.notice .icon {
  color: var(--accent);
}
/* 报错可能带路径、命令输出，最多显示 4 行 */
.text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  user-select: text;
}
.text b {
  margin-right: 6px;
  font-weight: 600;
  color: var(--danger);
}

/* 出现：从上方滑下来；消失：原地渐渐淡出；其余提示平滑补位 */
.toast-enter-active {
  transition: transform var(--dur-slow) var(--ease-out), opacity var(--dur-slow) var(--ease-out);
}
.toast-enter-from {
  transform: translateY(-16px);
  opacity: 0;
}
.toast-leave-active {
  position: absolute;
  transition: opacity 0.5s ease-out;
}
.toast-leave-to {
  opacity: 0;
}
.toast-move {
  transition: transform var(--dur-slow) var(--ease-out);
}
</style>
