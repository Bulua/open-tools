<script setup lang="ts">
import { AlarmClock, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { formatDateTime } from "@/utils/time";
import { alerts, dismissAlert } from "@/tools/utility/countdown/countdownStore";

/** 倒计时到期提醒：显示在窗口右下角，在任何工具中都能看到 */
const emit = defineEmits<{ open: [] }>();
const { t } = useI18n();
</script>

<template>
  <TransitionGroup name="alert" tag="div" class="alerts">
    <div v-for="a in alerts" :key="a.id" class="alert" role="alert">
      <span class="icon"><AlarmClock :size="18" /></span>
      <div class="text">
        <b>{{ t("countdown.timeUp", { title: a.title || t("countdown.defaultTitle") }) }}</b>
        <span>{{ formatDateTime(new Date(a.target)) }}</span>
      </div>
      <button class="btn small" @click="emit('open'), dismissAlert(a.id)">{{ t("countdown.view") }}</button>
      <button class="icon-btn" :title="t('countdown.dismiss')" @click="dismissAlert(a.id)"><X :size="14" /></button>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.alerts {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.alert {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 340px;
  padding: 12px 10px 12px 14px;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.icon {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  animation: ring 1s ease-in-out 3;
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.text b {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text span {
  font-size: 12px;
  color: var(--text-3);
}
@keyframes ring {
  0%,
  100% {
    transform: rotate(0);
  }
  20%,
  60% {
    transform: rotate(-14deg);
  }
  40%,
  80% {
    transform: rotate(14deg);
  }
}
.alert-enter-active,
.alert-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.alert-enter-from,
.alert-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
