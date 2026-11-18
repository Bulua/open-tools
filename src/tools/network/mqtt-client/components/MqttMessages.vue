<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowDownLeft, ArrowUpRight, Trash2, X } from "lucide-vue-next";
import TextPane from "@/components/common/TextPane.vue";
import { displayPayload, type Message } from "../mqtt";

const props = defineProps<{ messages: Message[] }>();
const emit = defineEmits<{ clear: [] }>();
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
  if (!list.some(message => message.id === selectedId.value)) selectedId.value = undefined;
  await nextTick(); if (follow.value && log.value) log.value.scrollTop = log.value.scrollHeight;
}, { immediate: true });
const select = (id: number) => { selectedId.value = id; follow.value = false; };
</script>

<template>
  <section class="message-panel">
    <header class="message-head">
      <div class="seg"><button v-for="direction in (['all', 'received', 'sent'] as const)" :key="direction" :class="{ on: filter === direction }" :aria-pressed="filter === direction" @click="filter = direction">{{ t(`network.mqtt.${direction}`) }}</button></div>
      <div class="message-options"><label class="check"><input v-model="format" type="checkbox" />{{ t("network.mqtt.format") }}</label><label class="check"><input v-model="follow" type="checkbox" />{{ t("network.mqtt.follow") }}</label><button class="icon-btn" :disabled="!messages.length" :title="t('network.mqtt.clear')" :aria-label="t('network.mqtt.clear')" @click="emit('clear')"><Trash2 :size="14" /></button></div>
    </header>
    <div ref="log" class="message-log" :aria-label="t('network.mqtt.messages')">
      <div v-if="!visible.length" class="empty"><ArrowDownLeft :size="28" /><span>{{ t("network.mqtt.empty") }}</span><small>{{ t("network.mqtt.messageHint") }}</small></div>
      <article v-for="message in visible" :key="message.id" class="message-item" :class="message.direction">
        <button class="message-summary" :class="{ selected: selectedId === message.id }" :aria-pressed="selectedId === message.id" @click="select(message.id)">
          <span class="summary-line"><ArrowDownLeft v-if="message.direction === 'received'" :size="14" /><ArrowUpRight v-else :size="14" /><code :title="message.topic">{{ message.topic }}</code><small>{{ t("network.mqtt.qosValue", { n: message.qos }) }}</small><small v-if="message.retain">{{ t("network.mqtt.retained") }}</small></span>
          <pre>{{ displayPayload(message.payload, format && !message.binary) || t('network.mqtt.emptyPayload') }}</pre>
          <span v-if="message.binary" class="binary-label">{{ t("network.mqtt.binary") }}</span>
        </button>
        <footer><time>{{ timeFormat.format(message.time) }}</time><span>{{ t("network.mqtt.bytes", { n: message.bytes }) }}</span></footer>
      </article>
    </div>
    <Transition name="mqtt-detail">
    <div v-if="selected" class="message-detail">
      <TextPane :model-value="content" class="detail-data" :label="selected.binary ? t('network.mqtt.binary') : selected.topic" :language="language" readonly>
        <template #actions>
          <div class="seg detail-format"><button :class="{ on: !format }" :aria-pressed="!format" @click="format = false">{{ t("network.mqtt.rawData") }}</button><button :class="{ on: format }" :aria-pressed="format" @click="format = true">{{ t("network.mqtt.format") }}</button></div>
          <button class="icon-btn" :title="t('network.mqtt.closeDetail')" :aria-label="t('network.mqtt.closeDetail')" @click="selectedId = undefined"><X :size="14" /></button>
        </template>
      </TextPane>
    </div>
    </Transition>
  </section>
</template>

<style scoped>
.message-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; background: var(--surface); }
.message-head, .message-options { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.message-head { flex-shrink: 0; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface); }
.message-options .check { font-size: 11px; }
.message-log { display: flex; flex-direction: column; align-items: flex-start; flex: 1; min-height: 0; overflow: auto; padding: 18px; gap: 18px; }
.message-item { max-width: 90%; min-width: min(220px, 100%); }
.message-item.sent { align-self: flex-end; }
.message-summary { display: block; width: 100%; padding: 12px 16px; border: 1px solid var(--border); border-inline-start: 3px solid var(--success); border-radius: 3px 10px 10px; background: var(--surface); color: var(--text); text-align: start; box-shadow: var(--shadow-sm); }
.sent .message-summary { border-inline-start-color: var(--accent); border-radius: 10px 3px 10px 10px; background: var(--accent-soft); }
.message-summary:hover { border-color: var(--border-strong); }
.message-summary.selected { outline: 1px solid var(--accent); }
.message-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.summary-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.summary-line > svg { color: var(--success); flex-shrink: 0; }
.sent .summary-line > svg { color: var(--accent); }
.summary-line small, .binary-label { color: var(--text-3); font-size: 10px; }
.message-summary code { overflow-wrap: anywhere; font: 12px var(--font-mono); }
.message-summary pre { margin: 10px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.7 var(--font-mono); max-height: 240px; overflow: auto; }
.message-item footer { display: flex; gap: 10px; padding: 6px 3px 0; color: var(--text-3); font-size: 10px; }
.sent footer { justify-content: flex-end; }
.message-detail { display: flex; flex: 0 0 clamp(100px, 20vh, 200px); min-height: 0; border-top: 1px solid var(--border); background: var(--surface); }
.message-detail { overflow: hidden; }
.mqtt-detail-enter-active, .mqtt-detail-leave-active { transition: flex-basis var(--dur) var(--ease-out), clip-path var(--dur) var(--ease-out); }
.mqtt-detail-enter-from, .mqtt-detail-leave-to { flex-basis: 0; clip-path: inset(100% 0 0); pointer-events: none; }
.mqtt-detail-enter-to, .mqtt-detail-leave-from { clip-path: inset(0); }
.detail-data { flex: 1; min-height: 0; border: 0; border-radius: 0; }
.detail-data :deep(.pane-head) { flex-wrap: wrap; }
.detail-data :deep(.pane-label) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.detail-format button { height: 24px; padding: 0 7px; font-size: 11px; }
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; align-self: stretch; flex: 1; gap: 10px; min-height: 100px; padding: 20px; color: var(--text-3); font-size: 13px; text-align: center; }
.empty > svg { color: var(--border-strong); }
.empty small { max-width: 280px; font-size: 11px; line-height: 1.7; }
@container (max-width: 480px) { .message-head { padding: 8px; } .message-log { padding: 12px 8px; } .message-item { max-width: 96%; } }
</style>
