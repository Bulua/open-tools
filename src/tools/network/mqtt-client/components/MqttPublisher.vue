<script setup lang="ts">
import { computed } from "vue";
import { Send } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import AppSelect from "@/components/common/AppSelect.vue";
import MqttTopicInput from "./MqttTopicInput.vue";
import TextPane from "@/components/common/TextPane.vue";
import { validTopic, type PublishDraft, type QoS, type SentPayload } from "../mqtt";
import { encodePayload, PAYLOAD_FORMATS } from "../payload";

const props = defineProps<{ connected: boolean; busy: boolean; topics: string[]; active: boolean }>();
const draft = defineModel<PublishDraft>({ required: true });
const emit = defineEmits<{ publish: [topic: string, payload: Uint8Array, qos: QoS, retain: boolean, sent: SentPayload] }>();
const { t } = useI18n();
const topicValid = computed(() => validTopic(draft.value.publishTopic));
const encoded = computed(() => encodePayload(draft.value.payload, draft.value.mode));
const payloadError = computed(() => encoded.value.error ? t(`network.mqtt.${encoded.value.error}`) : "");
const qosOptions = computed(() => ([0, 1, 2] as const).map(value => ({ value, label: t("network.mqtt.qosValue", { n: value }), hint: t(`network.mqtt.qos${value}`) })));
const modeOptions = computed(() => PAYLOAD_FORMATS.map(value => ({ value, label: t(`network.mqtt.${value}`) })));
const send = () => {
  if (!props.connected || props.busy || !topicValid.value || !encoded.value.bytes) return;
  const { publishTopic, publishQos, retain } = draft.value;
  emit("publish", publishTopic, encoded.value.bytes, publishQos, retain, { format: draft.value.mode, payload: draft.value.payload });
};
</script>

<template>
  <section class="publish-panel" :aria-label="t('network.mqtt.publish')">
    <div class="publish-controls">
      <MqttTopicInput v-model="draft.publishTopic" :topics="topics" :active="active" />
      <AppSelect v-model="draft.publishQos" class="qos-select" size="sm" :options="qosOptions" :aria-label="t('network.mqtt.qos')" />
      <div class="format-control"><span>{{ t("network.mqtt.sendFormat") }}</span><AppSelect v-model="draft.mode" class="mode-select" size="sm" :options="modeOptions" :aria-label="t('network.mqtt.sendFormat')" /></div>
      <label class="check" :title="t('network.mqtt.retainHint')"><input v-model="draft.retain" type="checkbox" />{{ t("network.mqtt.retain") }}</label>
    </div>
    <p v-if="payloadError" class="payload-error" role="status">{{ payloadError }}</p>
    <div class="payload-editor">
      <TextPane v-model="draft.payload" class="payload" :title="payloadError || undefined" hide-header :label="t('network.mqtt.payload')" :placeholder="t('network.mqtt.payloadHint')" :language="draft.mode === 'json' ? 'json' : undefined" />
      <div class="payload-actions">
        <button class="btn primary" :disabled="!connected || busy || !topicValid || !!payloadError" :title="!topicValid ? t('network.mqtt.topicError') : payloadError || undefined" @click="send"><Send :size="14" />{{ t(busy ? 'network.mqtt.sending' : 'network.mqtt.send') }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.publish-panel { display: flex; flex-direction: column; flex: 0 0 clamp(180px, 28vh, 270px); min-height: 0; overflow: hidden; padding: 0 14px 12px; border-top: 1px solid var(--border); background: var(--surface); }
.publish-controls { display: flex; flex-shrink: 0; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 0; }
.publish-controls :deep(.qos-select) { width: 90px; flex: 0 0 90px; }
.format-control { display: flex; align-items: center; gap: 6px; color: var(--text-2); font-size: 11px; }
.publish-controls :deep(.mode-select) { width: 110px; flex: 0 0 110px; }
.payload-error { flex-shrink: 0; margin: 0 0 6px; color: var(--danger); font-size: 11px; }
.payload-editor { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); transition: border-color var(--dur-fast) var(--ease-out); }
.payload-editor:focus-within { border-color: var(--border-strong); }
.payload-editor > .payload { min-height: 0; flex: 1; border: 0; border-radius: 0; }
.payload-actions { display: flex; flex-shrink: 0; justify-content: flex-end; padding: 0 10px 10px; }
@container (max-width: 480px) { .publish-panel { flex-basis: 230px; padding-inline: 8px; } }
@media (max-height: 650px) { .publish-panel { flex-basis: 180px; } }
</style>
