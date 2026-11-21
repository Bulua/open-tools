<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { MessageSquare, Plug, RefreshCw, SlidersHorizontal } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import AppSelect from "@/components/common/AppSelect.vue";
import { CONNECTION_TRANSPORTS, DEFAULT_PORTS, createClientId, isWebSocket, usesTls, validWebSocketPath, MQTT_VERSIONS, type ConnectionConfig, type ConnectionTransport } from "../mqtt";

const props = defineProps<{ config: ConnectionConfig; disabled: boolean }>();
const name = defineModel<string>("name", { required: true });
const { t } = useI18n();
const panel = ref<"general" | "advanced" | "lastWill">("general");
const formId = useId();
const tabs = [{ id: "general", icon: Plug }, { id: "advanced", icon: SlidersHorizontal }, { id: "lastWill", icon: MessageSquare }] as const;
const tabKey = (event: KeyboardEvent) => {
  const index = tabs.findIndex(tab => tab.id === panel.value);
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : -1;
  if (next < 0) return;
  event.preventDefault();
  const buttons = (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons[next]?.focus(); buttons[next]?.click();
};
const versionOptions = computed(() => MQTT_VERSIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) })));
const qosOptions = computed(() => [0, 1, 2].map(value => ({ value, label: t("network.mqtt.qosValue", { n: value }) })));
const transportOptions = CONNECTION_TRANSPORTS.map(value => ({ value, label: `${value}://` }));
const transport = computed({
  get: () => props.config.transport,
  set: (value: ConnectionTransport) => {
    if (props.config.port === DEFAULT_PORTS[props.config.transport]) props.config.port = DEFAULT_PORTS[value];
    props.config.transport = value;
    props.config.tls = usesTls(value);
  },
});
const regenerateId = () => { props.config.clientId = createClientId(); };
</script>

<template>
  <div class="connection-fields">
    <header class="config-tabs-head">
      <div class="seg config-tabs" role="tablist" :aria-label="t('network.mqtt.connection')" @keydown="tabKey">
        <button v-for="tab in tabs" :id="`${formId}-tab-${tab.id}`" :key="tab.id" type="button" role="tab" :class="{ on: panel === tab.id }" :aria-selected="panel === tab.id" :aria-controls="`${formId}-panel-${tab.id}`" :tabindex="panel === tab.id ? 0 : -1" :title="t(`network.mqtt.${tab.id}`)" @click="panel = tab.id"><component :is="tab.icon" :size="15" /><span>{{ t(`network.mqtt.${tab.id}`) }}</span></button>
      </div>
    </header>
    <section v-show="panel === 'general'" :id="`${formId}-panel-general`" class="config-section general-section" :class="{ current: panel === 'general' }" role="tabpanel" :aria-labelledby="`${formId}-tab-general`">
      <fieldset class="config-body" :disabled="disabled">
        <label class="config-row connection-name"><span>{{ t("network.mqtt.connectionName") }}</span><input v-model="name" class="field" maxlength="100" required autofocus /></label>
        <label class="config-row host"><span>{{ t("network.mqtt.host") }}</span><div class="address-input"><AppSelect v-model="transport" class="transport-select" :options="transportOptions" :disabled="disabled" :aria-label="t('network.mqtt.transport')" /><input v-model="config.host" class="field small-text" :placeholder="t('network.mqtt.hostHint')" spellcheck="false" /></div></label>
        <label class="config-row port"><span>{{ t("network.mqtt.port") }}</span><input v-model.number="config.port" class="field number-field small-text" type="number" min="1" max="65535" /></label>
        <label v-if="isWebSocket(transport)" class="config-row websocket-path"><span>{{ t("network.mqtt.path") }}</span><input v-model="config.path" class="field small-text" :placeholder="t('network.mqtt.pathHint')" :aria-invalid="!validWebSocketPath(config.path)" spellcheck="false" /></label>
        <label class="config-row client-id"><span>{{ t("network.mqtt.clientId") }}</span><div class="input-action"><input v-model="config.clientId" class="field small-text" spellcheck="false" /><button type="button" class="icon-btn" :aria-label="t('network.mqtt.regenerateId')" :title="t('network.mqtt.regenerateId')" @click="regenerateId"><RefreshCw :size="14" /></button></div></label>
        <label class="config-row credentials"><span>{{ t("network.mqtt.username") }}</span><input v-model="config.username" class="field" :placeholder="t('network.mqtt.optional')" autocomplete="off" /></label>
        <label class="config-row password"><span>{{ t("network.mqtt.password") }}</span><input v-model="config.password" class="field" type="password" :placeholder="t('network.mqtt.optional')" autocomplete="new-password" /></label>
      </fieldset>
    </section>
    <section v-show="panel === 'advanced'" :id="`${formId}-panel-advanced`" class="config-section" :class="{ current: panel === 'advanced' }" role="tabpanel" :aria-labelledby="`${formId}-tab-advanced`">
      <fieldset class="config-body" :disabled="disabled">
          <label class="config-row"><span>{{ t("network.mqtt.connectTimeout") }}</span><div class="input-unit"><input v-model.number="config.connectTimeout" class="field number-field small-text" type="number" min="1" max="300" /><small>{{ t("network.mqtt.seconds") }}</small></div></label>
          <label class="config-row keep-alive"><span>{{ t("network.mqtt.keepAlive") }}</span><div class="input-unit"><input v-model.number="config.keepAlive" class="field number-field small-text" type="number" min="5" max="65535" /><small>{{ t("network.mqtt.seconds") }}</small></div></label>
          <div class="config-row"><span>{{ t("network.mqtt.cleanSession") }}</span><label class="check"><input v-model="config.cleanSession" type="checkbox" />{{ t("network.mqtt.enabled") }}</label></div>
          <div class="config-row"><span>{{ t("network.mqtt.autoReconnect") }}</span><label class="check"><input v-model="config.autoReconnect" type="checkbox" />{{ t("network.mqtt.enabled") }}</label></div>
          <label class="config-row"><span>{{ t("network.mqtt.reconnectPeriod") }}</span><div class="input-unit"><input v-model.number="config.reconnectPeriod" class="field number-field small-text" type="number" min="1000" max="3600000" :disabled="!config.autoReconnect" /><small>{{ t("network.mqtt.milliseconds") }}</small></div></label>
          <div class="config-row"><span>{{ t("network.mqtt.mqttVersion") }}</span><AppSelect v-model="config.protocolVersion" class="short-select" :options="versionOptions" :disabled="disabled" :aria-label="t('network.mqtt.mqttVersion')" /></div>
      </fieldset>
    </section>
    <section v-show="panel === 'lastWill'" :id="`${formId}-panel-lastWill`" class="config-section" :class="{ current: panel === 'lastWill' }" role="tabpanel" :aria-labelledby="`${formId}-tab-lastWill`">
      <fieldset class="config-body" :disabled="disabled">
          <div class="config-row"><span>{{ t("network.mqtt.lastWill") }}</span><label class="check"><input v-model="config.willEnabled" type="checkbox" />{{ t("network.mqtt.enabled") }}</label></div>
          <fieldset class="will-fields" :disabled="!config.willEnabled">
            <label class="config-row"><span>{{ t("network.mqtt.willTopic") }}</span><input v-model="config.willTopic" class="field small-text" :placeholder="t('network.mqtt.publishHint')" spellcheck="false" /></label>
            <label class="config-row"><span>{{ t("network.mqtt.willQos") }}</span><AppSelect v-model="config.willQos" class="short-select" :options="qosOptions" :aria-label="t('network.mqtt.willQos')" /></label>
            <div class="config-row"><span>{{ t("network.mqtt.willRetain") }}</span><label class="check"><input v-model="config.willRetain" type="checkbox" />{{ t("network.mqtt.enabled") }}</label></div>
            <label class="config-row payload-row"><span>{{ t("network.mqtt.willPayload") }}</span><textarea v-model="config.willPayload" class="field mono" :placeholder="t('network.mqtt.payloadHint')" spellcheck="false" /></label>
          </fieldset>
          <p class="config-hint">{{ t("network.mqtt.willHint") }}</p>
      </fieldset>
    </section>
  </div>
</template>

<style scoped>
.connection-fields { display: flex; flex-direction: column; min-width: 0; padding: 0; margin: 0; }
.config-tabs-head { display: flex; justify-content: center; padding: 18px 0 24px; background: var(--surface); }
.config-tabs { width: min(100%, 440px); }
.config-tabs button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 34px; min-width: 0; font-size: 14px; }
.config-tabs button > svg { flex-shrink: 0; }
.config-tabs button > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.config-section { min-width: 0; background: var(--surface); }
.config-section.current { animation: mqtt-config-switch var(--dur) var(--ease-out); }
@keyframes mqtt-config-switch { from { transform: translateY(6px); } to { transform: translateY(0); } }
.config-body { border: 0; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 18px; padding: 4px 20px 24px; }
.config-row { display: grid; grid-template-columns: 160px minmax(0, 360px); align-items: center; gap: 16px; margin: 0; min-width: 0; font-size: 12px; color: var(--text-2); }
.config-row > span { text-align: end; line-height: 1.5; }
.field { width: 100%; min-width: 0; height: 34px; }
.number-field, .short-select { width: 140px; max-width: 100%; }
.address-input { display: flex; align-items: center; gap: 8px; min-width: 0; }
.address-input :deep(.transport-select) { width: 100px; flex: 0 0 100px; }
.address-input > .field { flex: 1; }
.input-action, .input-unit { display: flex; align-items: center; gap: 10px; min-width: 0; }
.input-action > input { flex: 1; }
.input-action > button { flex-shrink: 0; }
.input-unit small { color: var(--text-3); }
.check { justify-self: start; }
.will-fields { display: flex; flex-direction: column; gap: 16px; border: 0; margin: 0; padding: 0; min-width: 0; }
.payload-row { align-items: start; }
.payload-row > span { padding-top: 8px; }
textarea.field { min-height: 110px; padding: 9px 12px; resize: vertical; font-size: 12px; line-height: 1.7; }
.config-hint { margin: 0; padding-inline-start: 176px; font-size: 11px; line-height: 1.7; color: var(--text-3); }
@container (max-width: 600px) { .config-row { grid-template-columns: 120px minmax(0, 1fr); gap: 12px; } .config-body { padding-inline: 14px; } .config-hint { padding-inline-start: 132px; } }
@container (max-width: 380px) { .config-row { grid-template-columns: 90px minmax(0, 1fr); gap: 10px; } .config-hint { padding-inline-start: 100px; } }
</style>
