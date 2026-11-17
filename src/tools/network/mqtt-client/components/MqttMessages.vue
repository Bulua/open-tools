<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowDownLeft, ArrowUpRight, Send, Trash2 } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import MqttSplit from "./MqttSplit.vue";
import { displayPayload, type Message } from "../mqtt";

const props = defineProps<{ messages: Message[] }>();
const emit = defineEmits<{ clear: []; publish: [] }>();
const { t, locale } = useI18n();
const filter = ref<"all" | "received" | "sent">("all");
const format = ref(true);
const follow = ref(true);
const selectedId = ref<number>();
const log = ref<HTMLElement>();
const visible = computed(() => props.messages.filter(message => filter.value === "all" || message.direction === filter.value));
const selected = computed(() => visible.value.find(message => message.id === selectedId.value));
const content = computed(() => selected.value ? displayPayload(selected.value.payload, format.value && !selected.value.binary) : "");
const language = computed(() => {
  if (format.value && selected.value && !selected.value.binary) { try { JSON.parse(selected.value.payload); return "json" as const; } catch { /* 普通文本保持原文。 */ } }
  return "text" as const;
});
const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
watch([visible, follow], async ([list]) => {
  if (follow.value || !list.some(message => message.id === selectedId.value)) selectedId.value = list[list.length - 1]?.id;
  await nextTick(); if (follow.value && log.value) log.value.scrollTop = log.value.scrollHeight;
}, { immediate: true });
const select = (id: number) => { selectedId.value = id; follow.value = false; };
</script>

<template>
  <section class="message-panel">
    <header class="message-head">
      <div class="seg"><button v-for="direction in (['all', 'received', 'sent'] as const)" :key="direction" :class="{ on: filter === direction }" :aria-pressed="filter === direction" @click="filter = direction">{{ t(`network.mqtt.${direction}`) }}</button></div>
      <div class="message-options"><label class="check"><input v-model="follow" type="checkbox" />{{ t("network.mqtt.follow") }}</label><button class="icon-btn" :disabled="!messages.length" :title="t('network.mqtt.clear')" :aria-label="t('network.mqtt.clear')" @click="emit('clear')"><Trash2 :size="14" /></button><button class="btn small open-send" @click="emit('publish')"><Send :size="13" />{{ t("network.mqtt.openSend") }}</button></div>
    </header>
    <MqttSplit storage-key="messageSummary" :initial="150" :label="t('network.mqtt.resizeSummary')">
      <template #left>
        <div ref="log" class="message-log" :aria-label="t('network.mqtt.messages')">
          <p v-if="!visible.length" class="empty">{{ t("network.mqtt.empty") }}</p>
          <button v-for="message in visible" :key="message.id" class="message-summary" :class="[message.direction, { selected: selectedId === message.id }]" :aria-pressed="selectedId === message.id" @click="select(message.id)">
            <span class="summary-line"><ArrowDownLeft v-if="message.direction === 'received'" :size="13" /><ArrowUpRight v-else :size="13" /><time>{{ timeFormat.format(message.time) }}</time></span>
            <code :title="message.topic">{{ message.topic }}</code>
            <span class="summary-line"><small>{{ t("network.mqtt.bytes", { n: message.bytes }) }}</small><small>{{ t("network.mqtt.qosValue", { n: message.qos }) }}</small></span>
          </button>
        </div>
      </template>
      <template #right>
        <div class="message-detail">
          <TextPane v-if="selected" :model-value="content" class="detail-data" :label="selected.binary ? t('network.mqtt.binary') : selected.topic" :language="language" readonly>
            <template #actions>
              <div class="seg detail-format"><button :class="{ on: !format }" :aria-pressed="!format" @click="format = false">{{ t("network.mqtt.rawData") }}</button><button :class="{ on: format }" :aria-pressed="format" @click="format = true">{{ t("network.mqtt.format") }}</button></div>
              <span v-if="selected.retain" class="detail-meta">{{ t("network.mqtt.retained") }}</span>
            </template>
          </TextPane>
          <p v-else class="empty">{{ t("network.mqtt.empty") }}</p>
        </div>
      </template>
    </MqttSplit>
  </section>
</template>

<style scoped>
.message-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.message-head, .message-options { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.message-head { flex-shrink: 0; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.message-log { flex: 1; min-height: 0; overflow: auto; }
.message-summary { display: flex; flex-direction: column; gap: 5px; width: 100%; padding: 9px 8px; border: 0; border-bottom: 1px solid var(--border); border-inline-start: 3px solid var(--success); background: none; color: var(--text-2); text-align: start; font-size: 11px; }
.message-summary.sent { border-inline-start-color: var(--accent); }
.message-summary:hover { background: var(--hover); }
.message-summary.selected { background: var(--accent-soft); color: var(--text); }
.message-summary:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }
.summary-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.summary-line small { color: var(--text-3); font-size: 11px; }
.message-summary code { display: block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font: 11px var(--font-mono); }
.message-detail { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; padding: 0; }
.detail-meta { font-size: 11px; color: var(--text-3); }
.detail-data { flex: 1; min-height: 0; border: 0; border-radius: 0; }
.detail-data :deep(.pane-head) { min-height: 36px; gap: 6px; padding: 3px 6px 3px 10px; flex-wrap: wrap; }
.detail-data :deep(.pane-label) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.detail-data :deep(.pane-actions) { margin-left: 0; max-width: 100%; flex-wrap: wrap; }
.detail-format button { height: 24px; padding: 0 7px; font-size: 11px; }
.empty { display: grid; place-content: center; flex: 1; margin: 0; min-height: 60px; padding: 16px; color: var(--text-3); font-size: 12px; text-align: center; }
</style>
