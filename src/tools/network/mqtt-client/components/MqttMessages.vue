<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowDownLeft, ArrowUpRight, Trash2 } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import type { Message } from "../mqtt";
import { formatPayload, PAYLOAD_FORMATS, type PayloadFormat } from "../payload";

const props = defineProps<{ messages: Message[] }>();
const emit = defineEmits<{ clear: [] }>();
const { t, locale } = useI18n();
const filter = ref<"all" | "received" | "sent">("all");
const receiveFormat = ref<PayloadFormat>("json");
const modeOptions = computed(() => PAYLOAD_FORMATS.map(value => ({ value, label: t(`network.mqtt.${value}`) })));
const follow = ref(true);
const log = ref<HTMLElement>();
const visible = computed(() => props.messages.filter(message => filter.value === "all" || message.direction === filter.value));
// 发送记录固定使用发送时的格式与原文，接收格式只作用于接收记录。
const messageFormat = (message: Message): PayloadFormat => message.direction === "sent" ? message.sent?.format ?? "text" : receiveFormat.value;
const messageContent = (message: Message): string => message.direction === "sent" && message.sent ? message.sent.payload : formatPayload(message.rawPayload, messageFormat(message));
const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
watch([visible, follow], async () => {
  await nextTick(); if (follow.value && log.value) log.value.scrollTop = log.value.scrollHeight;
}, { immediate: true });
</script>

<template>
  <section class="message-panel">
    <header class="message-head">
      <div class="format-control"><span>{{ t("network.mqtt.receiveFormat") }}</span><AppSelect v-model="receiveFormat" class="message-format" size="sm" :options="modeOptions" :aria-label="t('network.mqtt.receiveFormat')" /></div>
      <div class="message-options"><div class="seg"><button v-for="direction in (['all', 'received', 'sent'] as const)" :key="direction" :class="{ on: filter === direction }" :aria-pressed="filter === direction" @click="filter = direction">{{ t(`network.mqtt.${direction}`) }}</button></div><label class="check"><input v-model="follow" type="checkbox" />{{ t("network.mqtt.follow") }}</label><button class="icon-btn" :disabled="!messages.length" :title="t('network.mqtt.clear')" :aria-label="t('network.mqtt.clear')" @click="emit('clear')"><Trash2 :size="14" /></button></div>
    </header>
    <div ref="log" class="message-log" :aria-label="t('network.mqtt.messages')">
      <div v-if="!visible.length" class="empty"><ArrowDownLeft :size="28" /><span>{{ t("network.mqtt.empty") }}</span><small>{{ t("network.mqtt.messageHint") }}</small></div>
      <article v-for="message in visible" :key="message.id" class="message-item" :class="message.direction">
        <div class="message-summary" tabindex="0" @pointerdown="follow = false" @focus="follow = false">
          <span class="summary-line"><ArrowDownLeft v-if="message.direction === 'received'" :size="14" /><ArrowUpRight v-else :size="14" /><code :title="message.topic">{{ message.topic }}</code><small>{{ t("network.mqtt.qosValue", { n: message.qos }) }}</small><small v-if="message.retain">{{ t("network.mqtt.retained") }}</small></span>
          <pre>{{ messageContent(message) || t('network.mqtt.emptyPayload') }}</pre>
          <span v-if="message.binary" class="binary-label">{{ t("network.mqtt.binary") }}</span>
        </div>
        <footer><time>{{ timeFormat.format(message.time) }}</time><span>{{ t("network.mqtt.bytes", { n: message.bytes }) }}</span><span>{{ t(`network.mqtt.${messageFormat(message)}`) }}</span></footer>
      </article>
    </div>
  </section>
</template>

<style scoped>
.message-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; background: var(--surface); }
.message-head, .message-options { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.message-head { flex-shrink: 0; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface); }
.format-control { display: flex; align-items: center; gap: 6px; color: var(--text-2); font-size: 11px; }
.message-options { margin-inline-start: auto; }
.message-options .check { font-size: 11px; }
.message-log { display: flex; flex-direction: column; align-items: flex-start; flex: 1; min-height: 0; overflow: auto; padding: 18px; gap: 18px; }
.message-item { max-width: 90%; min-width: min(220px, 100%); }
.message-item.sent { align-self: flex-end; }
.message-summary { display: block; width: 100%; padding: 12px 16px; border: 1px solid var(--border); border-inline-start: 3px solid var(--success); border-radius: 3px 10px 10px; background: var(--surface); color: var(--text); text-align: start; box-shadow: var(--shadow-sm); user-select: text; cursor: text; }
.sent .message-summary { border-inline-start-color: var(--accent); border-radius: 10px 3px 10px 10px; background: var(--accent-soft); }
.message-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.summary-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.summary-line > svg { color: var(--success); flex-shrink: 0; }
.sent .summary-line > svg { color: var(--accent); }
.summary-line small, .binary-label { color: var(--text-3); font-size: 10px; }
.message-summary code { overflow-wrap: anywhere; font: 12px var(--font-sans); }
.message-summary pre { margin: 10px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.7 var(--font-mono); max-height: 240px; overflow: auto; }
.message-item footer { display: flex; gap: 10px; padding: 6px 3px 0; color: var(--text-3); font-size: 10px; }
.sent footer { justify-content: flex-end; }
.format-control :deep(.message-format) { width: 110px; flex: 0 0 110px; }
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; align-self: stretch; flex: 1; gap: 10px; min-height: 100px; padding: 20px; color: var(--text-3); font-size: 13px; text-align: center; }
.empty > svg { color: var(--border-strong); }
.empty small { max-width: 280px; font-size: 11px; line-height: 1.7; }
@container (max-width: 480px) { .message-head { padding: 8px; } .message-log { padding: 12px 8px; } .message-item { max-width: 96%; } }
</style>
