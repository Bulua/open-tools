<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { Pause, Play } from "lucide-vue-next";
import CopyList from "@/components/common/CopyList.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { TOOL_ACTIONS } from "@/components/tool/toolActions";
import { formatDateTime, relativeTime } from "@/utils/time";
import { parseTimeInput, type TimestampUnit } from "../timestamp";

/** 时间戳 ↔ 日期：输入时间戳或日期，一次显示所有常用格式 */

// ---------- 当前时间 ----------
const now = ref(Date.now());
const running = ref(true);
// 工具切到后台时停止计时，回来时立即刷新
let timer: ReturnType<typeof setInterval> | undefined;
const startClock = () => {
  clearInterval(timer);
  now.value = Date.now();
  timer = setInterval(() => running.value && (now.value = Date.now()), 1000);
};
const stopClock = () => clearInterval(timer);
onMounted(startClock);
onActivated(startClock);
onDeactivated(stopClock);
onBeforeUnmount(stopClock);

const nowItems = computed(() => [
  { label: "秒", value: String(Math.floor(now.value / 1000)) },
  { label: "毫秒", value: String(now.value) },
  { label: "本地时间", value: formatDateTime(new Date(now.value)) },
]);

// ---------- 转换 ----------
const unit = useStoredRef<TimestampUnit>("timestamp.unit", "auto");
const input = ref(String(Math.floor(Date.now() / 1000)));
const parsed = computed(() => parseTimeInput(input.value, unit.value));

const UNIT_LABEL = { s: "按秒解析", ms: "按毫秒解析", date: "按日期解析" };

const resultItems = computed(() => {
  const p = parsed.value;
  const d = p.ok ? p.date : null;
  return [
    { label: "本地时间", value: d ? formatDateTime(d) : "" },
    { label: "秒", value: d ? String(Math.floor(d.getTime() / 1000)) : "" },
    { label: "毫秒", value: d ? String(d.getTime()) : "" },
    { label: "ISO 8601", value: d ? d.toISOString() : "" },
    { label: "UTC", value: d ? d.toUTCString() : "" },
    { label: "相对现在", value: d ? relativeTime(d.getTime(), now.value) : "" },
  ];
});

const useNow = () => (input.value = String(Math.floor(Date.now() / 1000)));
</script>

<template>
  <div class="timestamp">
    <Teleport defer :to="TOOL_ACTIONS">
      <div class="seg" title="输入数字时如何理解">
        <button :class="{ on: unit === 'auto' }" @click="unit = 'auto'">自动识别</button>
        <button :class="{ on: unit === 's' }" @click="unit = 's'">秒</button>
        <button :class="{ on: unit === 'ms' }" @click="unit = 'ms'">毫秒</button>
      </div>
    </Teleport>

    <section class="card sunken now">
      <header class="card-title now-head">
        <span>当前时间</span>
        <button class="icon-btn" :title="running ? '暂停' : '继续'" @click="running = !running">
          <Pause v-if="running" :size="14" />
          <Play v-else :size="14" />
        </button>
      </header>
      <CopyList :items="nowItems" />
    </section>

    <section class="card convert">
      <div class="card-title">转换</div>
      <div class="input-row">
        <input
          v-model="input"
          class="field mono"
          :class="{ invalid: !parsed.ok && parsed.message }"
          spellcheck="false"
          placeholder="输入时间戳（秒或毫秒）或日期，例如 2024-01-02 03:04:05"
        />
        <button class="btn" @click="useNow">现在</button>
      </div>
      <p v-if="!parsed.ok && parsed.message" class="message error">{{ parsed.message }}</p>
      <p v-else-if="parsed.ok" class="message">{{ UNIT_LABEL[parsed.unit] }}</p>
      <CopyList :items="resultItems" />
    </section>
  </div>
</template>

<style scoped>
.timestamp {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 820px;
}
.now-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 8px;
}
.input-row {
  display: flex;
  gap: 8px;
  padding: 8px 16px 0;
}
.message {
  margin: 6px 16px 0;
  font-size: 12px;
  color: var(--text-3);
}
.message.error {
  color: var(--danger);
}
</style>
