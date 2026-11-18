<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, Plug, Plus, RefreshCw, Unplug, X } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import { createClientId, matchesTopic, MQTT_VERSIONS, validAdvancedConfig, validConfig, type PublishDraft, type QoS } from "../mqtt";
import { useMqtt } from "../useMqtt";
import MqttConnectionForm from "./MqttConnectionForm.vue";
import MqttSplit from "./MqttSplit.vue";
import MqttPublisher from "./MqttPublisher.vue";
import MqttSubscriptionDialog from "./MqttSubscriptionDialog.vue";
import MqttMessages from "./MqttMessages.vue";
import type { SessionNode } from "../workspace";
import { cleanDraft, type MqttDraft } from "../draft";

const props = defineProps<{ session: SessionNode; active: boolean; creating?: boolean }>();
const emit = defineEmits<{ draft: [id: string, value: MqttDraft]; status: [id: string, value: string]; create: [name: string, draft: MqttDraft]; cancel: []; rename: [id: string, name: string] }>();
const { t } = useI18n();
const versionOptions = computed(() => MQTT_VERSIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) })));
const { config, status, connected, subscriptions, topics, messages, busy, supported, connect, disconnect, subscribe, unsubscribe, publish } = useMqtt();
const draft = props.session.draft;
Object.assign(config, draft.config, { password: "" });
topics.value = draft.topics.map(item => ({ ...item }));
const { publishTopic, publishQos, retain, payload, mode } = draft;
const publishing = ref<PublishDraft>({ publishTopic, publishQos, retain, payload, mode });
const subscriptionQos = ref(draft.subscriptionQos);
const connectionExpanded = ref(false);
const connectionName = ref(props.session.name);
const configValid = computed(() => validConfig(config) && !!connectionName.value.trim());
const configHint = computed(() => t(validAdvancedConfig(config) ? "network.mqtt.configError" : "network.mqtt.advancedError"));
watch(() => props.session.name, value => { connectionName.value = value; });
watch(connectionName, value => {
  if (!props.creating && status.value === "disconnected" && value.trim() && value.trim() !== props.session.name) emit("rename", props.session.id, value.trim());
});
const regenerateId = () => { config.clientId = createClientId(); };
const subscriptionPanel = ref<InstanceType<typeof MqttSubscriptionDialog>>();
const openSubscription = () => { void subscriptionPanel.value?.open(); };
const selectedSubscription = ref<string | null>(null);
const activeTopics = computed(() => new Set(subscriptions.value.map(item => item.topic)));
const filteredMessages = computed(() => selectedSubscription.value === null ? messages.value : messages.value.filter(message => matchesTopic(selectedSubscription.value!, message.topic)));
watch(topics, list => { if (selectedSubscription.value !== null && !list.some(item => item.topic === selectedSubscription.value)) selectedSubscription.value = null; }, { deep: true });
const snapshot = (): MqttDraft => cleanDraft({ config: { ...config, port: Number(config.port) || 0, keepAlive: Number(config.keepAlive) || 0 }, topics: topics.value, ...publishing.value, subscriptionQos: subscriptionQos.value })!;
watch(snapshot, value => emit("draft", props.session.id, value), { deep: true, flush: "sync" });
watch(status, value => emit("status", props.session.id, value), { immediate: true });
const saveConnection = async () => {
  if (!configValid.value) return;
  emit("create", connectionName.value.trim(), snapshot());
  await nextTick();
  if (supported) void connect();
};
const addSubscription = async (topic: string, qos: QoS): Promise<boolean> => {
  if (busy.value) return false;
  if (connected.value) return subscribe(topic, qos);
  if (status.value !== "disconnected") return false;
  topics.value = [...topics.value.filter(item => item.topic !== topic), { topic, qos }];
  return true;
};
const removeTopic = (topic: string) => {
  if (connected.value && activeTopics.value.has(topic)) void unsubscribe(topic);
  else if (!busy.value) topics.value = topics.value.filter(item => item.topic !== topic);
};
</script>

<template>
  <div class="mqtt" :class="{ creating, 'is-active': active }">
    <section class="connection">
      <header v-if="creating" class="creation-heading"><div><h1>{{ t("network.mqtt.newSession") }}</h1></div><div class="creation-actions"><button type="button" class="btn" @click="emit('cancel')">{{ t("network.mqtt.cancelAction") }}</button><button type="button" class="btn primary" :disabled="!configValid" :title="!configValid ? configHint : undefined" @click="saveConnection"><Plug :size="14" />{{ t("network.mqtt.connect") }}</button></div></header>
      <header v-if="!creating" class="workspace-toolbar">
        <button class="connection-toggle" :aria-expanded="connectionExpanded" :title="t(connectionExpanded ? 'network.mqtt.hideConnection' : 'network.mqtt.showConnection')" @click="connectionExpanded = !connectionExpanded"><ChevronDown :size="15" :class="{ collapsed: !connectionExpanded }" /><span>{{ props.session.name }}</span></button>
        <code class="connection-address">{{ config.host }}:{{ config.port }}</code>
        <span class="status" :class="{ online: connected }" role="status"><i />{{ t(`network.mqtt.${status}`) }}</span>
        <button v-if="status === 'disconnected'" class="btn primary" :disabled="!supported || !configValid" :title="!configValid ? configHint : !supported ? t('network.mqtt.nativeOnly') : undefined" @click="connect"><Plug :size="14" />{{ t("network.mqtt.connect") }}</button>
        <button v-else class="btn" :disabled="status === 'disconnecting'" @click="disconnect"><Unplug :size="14" />{{ t(status === 'connecting' ? 'network.mqtt.cancel' : 'network.mqtt.disconnect') }}</button>
      </header>
      <div class="connection-details" :class="{ 'creation-scroll': creating, 'history-fold': !creating, 'is-collapsed': !creating && !connectionExpanded }" :aria-hidden="!creating && !connectionExpanded" :inert="!creating && !connectionExpanded ? true : undefined">
        <div class="history-fold-inner">
      <MqttConnectionForm v-if="creating" v-model:name="connectionName" :config="config" :disabled="status !== 'disconnected'" />
      <fieldset v-else class="connection-fields compact-fields" :disabled="status !== 'disconnected'">
        <label class="connection-name"><span>{{ t("network.mqtt.connectionName") }}</span><input v-model="connectionName" class="field" maxlength="100" required /></label>
        <label><span>{{ t("network.mqtt.clientId") }}</span><div class="compact-input-action"><input v-model="config.clientId" class="field mono" spellcheck="false" /><button type="button" class="icon-btn" :aria-label="t('network.mqtt.regenerateId')" :title="t('network.mqtt.regenerateId')" @click="regenerateId"><RefreshCw :size="14" /></button></div></label>
        <label><span>{{ t("network.mqtt.username") }}</span><input v-model="config.username" class="field" :placeholder="t('network.mqtt.optional')" autocomplete="off" /></label>
        <label><span>{{ t("network.mqtt.password") }}</span><input v-model="config.password" class="field" type="password" :placeholder="t('network.mqtt.optional')" autocomplete="new-password" /></label>
        <label><span>{{ t("network.mqtt.keepAlive") }}</span><input v-model.number="config.keepAlive" class="field mono" type="number" min="5" max="65535" /></label>
        <label><span>{{ t("network.mqtt.cleanSession") }}</span><span class="check compact-check"><input v-model="config.cleanSession" type="checkbox" />{{ t("network.mqtt.enabled") }}</span></label>
        <div class="compact-field"><span>{{ t("network.mqtt.mqttVersion") }}</span><AppSelect v-model="config.protocolVersion" :options="versionOptions" :disabled="status !== 'disconnected'" :aria-label="t('network.mqtt.mqttVersion')" /></div>
      </fieldset>
        </div>
      </div>
    </section>

    <MqttSplit v-if="!creating" class="workbench" storage-key="subscriptions" :initial="210" :label="t('network.mqtt.resizeSubscriptions')">
      <template #left>
        <section class="subscriptions">
          <header class="section-head"><button class="btn small subscription-add" :aria-label="t('network.mqtt.subscribe')" @click="openSubscription"><Plus :size="13" />{{ t("network.mqtt.addSubscription") }}</button></header>
          <ul v-if="topics.length" class="subscription-list">
            <li v-for="subscription in topics" :key="subscription.topic">
              <button class="subscription-filter" :class="{ selected: selectedSubscription === subscription.topic }" :aria-pressed="selectedSubscription === subscription.topic" @click="selectedSubscription = selectedSubscription === subscription.topic ? null : subscription.topic"><code>{{ subscription.topic }}</code><small>{{ t("network.mqtt.qosValue", { n: subscription.qos }) }} · {{ t(activeTopics.has(subscription.topic) ? "network.mqtt.activeTopic" : "network.mqtt.pendingTopic") }}</small></button>
              <button class="icon-btn" :disabled="busy || (status !== 'disconnected' && !connected)" :title="t('network.mqtt.removeTopic')" :aria-label="t('network.mqtt.removeTopic')" @click="removeTopic(subscription.topic)"><X :size="14" /></button>
            </li>
          </ul>
          <p v-else class="hint subscription-empty">{{ t("network.mqtt.subscriptionEmpty") }}</p>
        </section>
      </template>
      <template #right>
        <div class="traffic-page">
          <MqttMessages :messages="filteredMessages" @clear="messages = []" />
          <MqttPublisher v-model="publishing" :connected="connected" :busy="busy" @publish="publish" />
        </div>
      </template>
    </MqttSplit>
    <MqttSubscriptionDialog ref="subscriptionPanel" v-model:qos="subscriptionQos" :active="active" :connected="connected" :can-submit="!busy && (connected || status === 'disconnected')" :add="addSubscription" />
  </div>
</template>

<style scoped>
/* 连接实例保持挂载，切换只重播位移动画，不打断网络连接与编辑状态。 */
.mqtt.is-active { animation: mqtt-workspace-enter var(--dur-slow) var(--ease-out); }
.mqtt.creating.is-active { animation-name: mqtt-creation-enter; }
@keyframes mqtt-workspace-enter { from { transform: translateY(8px); clip-path: inset(0 0 8px); } to { transform: translateY(0); clip-path: inset(0); } }
@keyframes mqtt-creation-enter { from { transform: translateX(12px); clip-path: inset(0 12px 0 0); } to { transform: translateX(0); clip-path: inset(0); } }
.mqtt { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; container-type: inline-size; }
.connection { flex: none; padding: 0 18px; border-bottom: 1px solid var(--border); background: var(--surface); }
.mqtt:not(.creating) > .connection > .connection-details > .history-fold-inner { max-height: 45vh; overflow-y: auto; }
.compact-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); max-width: 960px; gap: 12px 18px; border: 0; margin: 14px 0 12px; padding: 0; min-width: 0; }
.compact-fields > label, .compact-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; color: var(--text-2); font-size: 12px; }
.compact-fields .field { min-width: 0; height: 32px; }
.compact-input-action { display: flex; align-items: center; gap: 6px; min-width: 0; }
.compact-input-action > .field { flex: 1; }
.compact-input-action > .icon-btn { flex-shrink: 0; }
.compact-check { min-height: 32px; }
@container (max-width: 600px) { .compact-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.workspace-toolbar { min-height: calc(var(--mqtt-header-height) - 1px); display: flex; align-items: center; gap: 12px; min-width: 0; }
.connection-toggle { display: inline-flex; align-items: center; gap: 8px; min-width: 0; padding: 0; border: 0; background: none; color: var(--text); font-size: 14px; font-weight: 600; }
.connection-toggle span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.connection-toggle svg { flex-shrink: 0; transition: transform var(--dur) var(--ease-out); }
.connection-toggle svg.collapsed { transform: rotate(-90deg); }
.connection-address { color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px var(--font-mono); }
.status { display: flex; align-items: center; gap: 6px; margin-left: auto; color: var(--text-2); font-size: 11px; white-space: nowrap; }
.status i { width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); }
.status.online { color: var(--success); }
.status.online i { background: var(--success); }
.hint, small { color: var(--text-3); font-size: 11px; }
.hint { margin: 0; line-height: 1.7; }
.subscriptions { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; padding: 14px 10px; overflow: hidden; background: var(--surface); }
.section-head { display: flex; flex-shrink: 0; flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 12px; }
.subscription-add { justify-content: center; color: var(--accent); border-color: var(--accent); }
.subscription-empty { display: grid; place-items: center; flex: 1; min-height: 0; text-align: center; padding: 16px; }
.subscription-list { flex: 1; min-height: 0; overflow: auto; list-style: none; padding: 0; margin: 6px 0 0; }
.subscription-list li { position: relative; display: flex; align-items: stretch; margin-bottom: 8px; }
.subscription-list li > .icon-btn { position: absolute; inset-inline-end: 6px; top: 8px; color: var(--text-3); }
.subscription-filter { display: flex; flex-direction: column; flex: 1; gap: 7px; min-width: 0; padding: 12px 34px 12px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); text-align: start; transition: background-color var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out), color var(--dur) var(--ease-out); }
.subscription-filter:hover { background: var(--hover); }
.subscription-filter.selected { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.subscription-filter:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.subscription-filter.selected small { color: var(--accent); }
code { font: 12px var(--font-mono); overflow-wrap: anywhere; }
.traffic-page { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.creating { background: var(--surface); }
.creating .connection { display: flex; flex-direction: column; flex: 1; min-height: 0; width: 100%; margin: 0; padding: 0; overflow: hidden; border: 0; background: none; }
.creation-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.creating .connection-details > .history-fold-inner { width: min(740px, calc(100% - 48px)); margin: 0 auto; padding-bottom: 24px; overflow: visible; }
.creation-heading { min-height: var(--mqtt-header-height); flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 10px 18px; background: var(--surface); border-bottom: 1px solid var(--border); }
.creation-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.creation-heading h1 { margin: 0; font-size: 16px; font-weight: 600; }
@container (max-width: 850px) { .connection-address { display: none; } }
@container (max-width: 480px) { .workspace-toolbar { gap: 6px; flex-wrap: wrap; } .connection { padding: 0 10px; } .creating .connection-details > .history-fold-inner { width: calc(100% - 24px); } .creation-heading { padding: 10px 12px; gap: 10px; } }
@media (prefers-reduced-motion: reduce) { .connection-toggle svg { transition: none; } }
</style>
