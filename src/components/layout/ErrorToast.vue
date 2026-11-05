<script setup lang="ts">
import { CircleAlert } from "lucide-vue-next";
import { errors, holdError, releaseError } from "@/utils/errorToast";

/**
 * 报错提示：显示 showError() 发出的报错，见 utils/errorToast.ts。
 * 在窗口上方、顶栏下面居中显示，3 秒后淡出；鼠标停在上面时不消失，内容可以选中复制。
 */
</script>

<template>
  <TransitionGroup name="toast" tag="div" class="toasts" aria-live="assertive">
    <div v-for="e in errors" :key="e.id" class="toast" role="alert" @mouseenter="holdError(e.id)" @mouseleave="releaseError(e.id)">
      <CircleAlert :size="16" class="icon" />
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
