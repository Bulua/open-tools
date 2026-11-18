<script setup lang="ts">
import { computed } from "vue";
import { Send } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import AppSelect from "@/components/common/AppSelect.vue";
import TextPane from "@/components/common/TextPane.vue";
import { MAX_PAYLOAD, validTopic, type PublishDraft, type QoS } from "../mqtt";

const props = defineProps<{ connected: boolean; busy: boolean }>();
const draft = defineModel<PublishDraft>({ required: true });
const emit = defineEmits<{ publish: [topic: string, payload: string, qos: QoS, retain: boolean] }>();
const { t } = useI18n();
const topicValid = computed(() => validTopic(draft.value.publishTopic));
const payloadError = computed(() => {
  if (new TextEncoder().encode(draft.value.payload).length > MAX_PAYLOAD) return t("network.mqtt.payloadError");
  if (draft.value.mode === "json") {
    try { JSON.parse(draft.value.payload); }
    catch { return t("network.mqtt.jsonError"); }
  }
  return "";
});
const qosOptions = computed(() => ([0, 1, 2] as const).map(value => ({ value, label: t("network.mqtt.qosValue", { n: value }), hint: t(`network.mqtt.qos${value}`) })));
const modeOptions = computed(() => (["text", "json"] as const).map(value => ({ value, label: t(`network.mqtt.${value}`) })));
const send = () => {
  if (!props.connected || props.busy || !topicValid.value || payloadError.value) return;
  const { publishTopic, payload, publishQos, retain } = draft.value;
  emit("publish", publishTopic, payload, publishQos, retain);
};
</script>

<template>
  <section class="publish-panel" :aria-label="t('network.mqtt.publish')">
    <div class="publish-controls">
      <input v-model="draft.publishTopic" class="field mono publish-topic" :aria-invalid="!topicValid" :aria-label="t('network.mqtt.topic')" :title="t('network.mqtt.topic')" :placeholder="t('network.mqtt.publishHint')" spellcheck="false" />
      <AppSelect v-model="draft.publishQos" class="qos-select" size="sm" :options="qosOptions" :aria-label="t('network.mqtt.qos')" />
      <AppSelect v-model="draft.mode" class="mode-select" size="sm" :options="modeOptions" :aria-label="t('network.mqtt.payload')" />
      <label class="check" :title="t('network.mqtt.retainHint')"><input v-model="draft.retain" type="checkbox" />{{ t("network.mqtt.retain") }}</label>
      <button class="btn primary" :disabled="!connected || busy || !topicValid || !!payloadError" :title="!topicValid ? t('network.mqtt.topicError') : payloadError || undefined" @click="send"><Send :size="14" />{{ t(busy ? 'network.mqtt.sending' : 'network.mqtt.send') }}</button>
    </div>
    <TextPane v-model="draft.payload" class="payload" :title="payloadError || undefined" hide-header :label="t('network.mqtt.payload')" :placeholder="t('network.mqtt.payloadHint')" :language="draft.mode === 'json' ? 'json' : undefined" />
  </section>
</template>

<style scoped>
.publish-panel { display: flex; flex-direction: column; flex: 0 0 clamp(180px, 28vh, 270px); min-height: 0; overflow: hidden; padding: 0 14px 12px; border-top: 1px solid var(--border); background: var(--surface); }
.publish-controls { display: flex; flex-shrink: 0; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 0; }
.publish-topic { flex: 1 1 180px; min-width: 0; }
.publish-controls :deep(.qos-select) { width: 90px; flex: 0 0 90px; }
.publish-controls :deep(.mode-select) { width: 80px; flex: 0 0 80px; }
.payload { min-height: 0; flex: 1; }
@container (max-width: 480px) { .publish-panel { flex-basis: 230px; padding-inline: 8px; } }
@media (max-height: 650px) { .publish-panel { flex-basis: 180px; } }
</style>
