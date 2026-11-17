<script setup lang="ts">
import { computed, nextTick, onDeactivated, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowLeft, ChevronDown, Plug, Plus, Radio, Send, Unplug, X } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import TextPane from "@/components/common/TextPane.vue";
import { MAX_PAYLOAD, matchesTopic, validConfig, validTopic, type QoS } from "../mqtt";
import { useMqtt } from "../useMqtt";
import MqttSplit from "./MqttSplit.vue";
import MqttMessages from "./MqttMessages.vue";
import { cleanDraft, type MqttDraft, type SessionNode } from "../profiles";

const props = defineProps<{ session: SessionNode; active: boolean }>();
const emit = defineEmits<{ draft: [id: string, value: MqttDraft]; status: [id: string, value: string] }>();
const { t } = useI18n();
const { config, status, connected, subscriptions, topics, messages, busy, supported, lastError, connect, disconnect, subscribe, unsubscribe, publish } = useMqtt();
const filterTopic = ref("test/demo");
const subscriptionQos = ref<QoS>(0);
const publishTopic = ref("test/demo");
const publishQos = ref<QoS>(0);
const retain = ref(false);
const payload = ref("");
const mode = ref<"text" | "json">("text");
const configValid = computed(() => validConfig(config));
const filterValid = computed(() => validTopic(filterTopic.value, true));
const topicValid = computed(() => validTopic(publishTopic.value));
const payloadBytes = computed(() => new TextEncoder().encode(payload.value).length);
const payloadError = computed(() => {
  if (payloadBytes.value > MAX_PAYLOAD) return t("network.mqtt.payloadError");
  if (mode.value === "json") { try { JSON.parse(payload.value); } catch { return t("network.mqtt.jsonError"); } }
  return "";
});
const qosOptions = computed(() => ([0, 1, 2] as const).map(value => ({ value, label: t("network.mqtt.qosValue", { n: value }), hint: t(`network.mqtt.qos${value}`) })));
const modeOptions = computed(() => (["text", "json"] as const).map(value => ({ value, label: t(`network.mqtt.${value}`) })));
const changeTls = () => { if (config.port === 1883 || config.port === 8883) config.port = config.tls ? 8883 : 1883; };
const connectionExpanded = ref(true);
const subscriptionDialog = ref<HTMLDialogElement>();
const subscriptionInput = ref<HTMLInputElement>();
const sendExpanded = ref(false);
const selectedSubscription = ref<string | null>(null);
const filteredMessages = computed(() => selectedSubscription.value === null ? messages.value : messages.value.filter(message => matchesTopic(selectedSubscription.value!, message.topic)));
watch(topics, list => { if (selectedSubscription.value !== null && !list.some(item => item.topic === selectedSubscription.value)) selectedSubscription.value = null; }, { deep: true });
const openSubscription = async () => {
  subscriptionDialog.value?.showModal(); await nextTick(); subscriptionInput.value?.focus(); subscriptionInput.value?.select();
};
onDeactivated(() => subscriptionDialog.value?.close());
const draft = props.session.draft;
Object.assign(config, draft.config, { password: "" });
topics.value = draft.topics.map(item => ({ ...item }));
publishTopic.value = draft.publishTopic; publishQos.value = draft.publishQos;
retain.value = draft.retain; payload.value = draft.payload; mode.value = draft.mode;
filterTopic.value = draft.filterTopic; subscriptionQos.value = draft.subscriptionQos;
const snapshot = (): MqttDraft => cleanDraft({ config: { ...config, port: Number(config.port) || 0, keepAlive: Number(config.keepAlive) || 0 }, topics: topics.value, publishTopic: publishTopic.value, publishQos: publishQos.value, retain: retain.value, payload: payload.value, mode: mode.value, filterTopic: filterTopic.value, subscriptionQos: subscriptionQos.value })!;
watch(snapshot, value => emit("draft", props.session.id, value), { deep: true, flush: "sync" });
watch(status, value => emit("status", props.session.id, value), { immediate: true });
watch(() => props.active, active => { if (!active) subscriptionDialog.value?.close(); });
const send = () => { if (topicValid.value && !payloadError.value) void publish(publishTopic.value, payload.value, publishQos.value, retain.value); };
const addSubscription = async () => {
  if (!filterValid.value || busy.value) return;
  const topic = filterTopic.value;
  if (connected.value) await subscribe(topic, subscriptionQos.value);
  else if (status.value === "disconnected") topics.value = [...topics.value.filter(item => item.topic !== filterTopic.value), { topic: filterTopic.value, qos: subscriptionQos.value }];
  if (topics.value.some(item => item.topic === topic)) subscriptionDialog.value?.close();
};
const removeTopic = (topic: string) => {
  if (connected.value && subscriptions.value.some(item => item.topic === topic)) void unsubscribe(topic);
  else if (!busy.value) topics.value = topics.value.filter(item => item.topic !== topic);
};
</script>

<template>
  <div class="mqtt" :class="{ 'send-expanded': sendExpanded }">
    <section v-show="!sendExpanded" class="connection">
      <header class="workspace-toolbar">
        <button class="connection-toggle" :aria-expanded="connectionExpanded" :title="t(connectionExpanded ? 'network.mqtt.hideConnection' : 'network.mqtt.showConnection')" @click="connectionExpanded = !connectionExpanded"><ChevronDown :size="15" :class="{ collapsed: !connectionExpanded }" /><span>{{ props.session.name }}</span></button>
        <span class="status" :class="{ online: connected }" role="status"><i />{{ t(`network.mqtt.${status}`) }}</span>
        <button v-if="status === 'disconnected'" class="btn primary" :disabled="!supported || !configValid" :title="!supported ? t('network.mqtt.nativeOnly') : undefined" @click="connect"><Plug :size="14" />{{ t("network.mqtt.connect") }}</button>
        <button v-else class="btn" :disabled="status === 'disconnecting'" @click="disconnect"><Unplug :size="14" />{{ t(status === 'connecting' ? 'network.mqtt.cancel' : 'network.mqtt.disconnect') }}</button>
      </header>
      <fieldset v-show="connectionExpanded" :disabled="status !== 'disconnected'" class="connection-fields">
        <label class="host"><span>{{ t("network.mqtt.host") }}</span><input v-model="config.host" class="field mono" :placeholder="t('network.mqtt.hostHint')" spellcheck="false" /></label>
        <label class="port"><span>{{ t("network.mqtt.port") }}</span><input v-model.number="config.port" class="field mono" type="number" min="1" max="65535" /></label>
        <label class="client-id"><span>{{ t("network.mqtt.clientId") }}</span><input v-model="config.clientId" class="field mono" spellcheck="false" /></label>
        <label class="keep-alive"><span>{{ t("network.mqtt.keepAlive") }}</span><input v-model.number="config.keepAlive" class="field mono" type="number" min="5" max="65535" /></label>
        <label class="credentials"><span>{{ t("network.mqtt.username") }}</span><input v-model="config.username" class="field" :placeholder="t('network.mqtt.optional')" autocomplete="off" /></label>
        <div class="password-options">
          <label class="password"><span>{{ t("network.mqtt.password") }}</span><input v-model="config.password" class="field" type="password" :placeholder="t('network.mqtt.optional')" autocomplete="new-password" /></label>
          <label class="check"><input v-model="config.tls" type="checkbox" @change="changeTls" />{{ t("network.mqtt.tls") }}</label>
          <label class="check"><input v-model="config.cleanSession" type="checkbox" />{{ t("network.mqtt.cleanSession") }}</label>
        </div>
      </fieldset>
      <p v-if="!configValid" class="validation">{{ t("network.mqtt.configError") }}</p>
      <p v-if="lastError" class="validation">{{ lastError }}</p>
    </section>

    <MqttSplit class="workbench" storage-key="subscriptions" :initial="170" :hidden="sendExpanded" :label="t('network.mqtt.resizeSubscriptions')">
      <template #left>
        <section class="subscriptions">
          <header class="section-head"><h2><Radio :size="16" />{{ t("network.mqtt.subscriptions") }}<span class="count">{{ topics.length }}</span></h2><button class="btn small subscription-add" :aria-label="t('network.mqtt.subscribe')" @click="openSubscription"><Plus :size="13" />{{ t("network.mqtt.subscriptions") }}</button></header>
          <button class="all-subscriptions" :class="{ selected: selectedSubscription === null }" :aria-pressed="selectedSubscription === null" @click="selectedSubscription = null">{{ t("network.mqtt.allSubscriptions") }}</button>
          <ul v-if="topics.length" class="subscription-list">
            <li v-for="subscription in topics" :key="subscription.topic">
              <button class="subscription-filter" :class="{ selected: selectedSubscription === subscription.topic }" :aria-pressed="selectedSubscription === subscription.topic" @click="selectedSubscription = subscription.topic"><code>{{ subscription.topic }}</code><small>{{ t("network.mqtt.qosValue", { n: subscription.qos }) }} · {{ t(subscriptions.some(item => item.topic === subscription.topic) ? "network.mqtt.activeTopic" : "network.mqtt.pendingTopic") }}</small></button>
              <button class="icon-btn" :disabled="busy || (status !== 'disconnected' && !connected)" :title="t('network.mqtt.removeTopic')" :aria-label="t('network.mqtt.removeTopic')" @click="removeTopic(subscription.topic)"><X :size="14" /></button>
            </li>
          </ul>
          <p v-else class="hint">{{ t("network.mqtt.subscriptionEmpty") }}</p>
        </section>
      </template>
      <template #right>
        <div class="traffic-page">
          <MqttMessages v-show="!sendExpanded" :messages="filteredMessages" @clear="messages = []" @publish="sendExpanded = true" />
          <section v-show="sendExpanded" class="publish-panel" :aria-label="t('network.mqtt.publish')">
            <header class="expanded-heading"><button class="btn small" :aria-label="t('network.mqtt.backMessages')" @click="sendExpanded = false"><ArrowLeft :size="14" />{{ t("network.mqtt.backMessages") }}</button><h2>{{ t("network.mqtt.openSend") }}</h2><span class="status" role="status">{{ t(`network.mqtt.${status}`) }}</span></header>
            <div class="publish-controls">
              <input v-model="publishTopic" class="field mono publish-topic" :aria-label="t('network.mqtt.topic')" :title="t('network.mqtt.topic')" :placeholder="t('network.mqtt.publishHint')" spellcheck="false" />
              <AppSelect v-model="publishQos" class="qos-select" size="sm" :options="qosOptions" :aria-label="t('network.mqtt.qos')" />
              <AppSelect v-model="mode" class="mode-select" size="sm" :options="modeOptions" :aria-label="t('network.mqtt.payload')" />
              <label class="check" :title="t('network.mqtt.retainHint')"><input v-model="retain" type="checkbox" />{{ t("network.mqtt.retain") }}</label>
              <button class="btn primary" :disabled="!connected || busy || !topicValid || !!payloadError" @click="send"><Send :size="14" />{{ t(busy ? 'network.mqtt.sending' : 'network.mqtt.send') }}</button>
            </div>
            <TextPane v-model="payload" class="payload" :label="t('network.mqtt.payload')" :placeholder="t('network.mqtt.payloadHint')" :language="mode === 'json' ? 'json' : undefined"><template #actions><span class="hint">{{ t("network.mqtt.bytes", { n: payloadBytes }) }}</span></template></TextPane>
            <p v-if="!topicValid || payloadError" class="validation publish-error">{{ !topicValid ? t("network.mqtt.topicError") : payloadError }}</p>
          </section>
        </div>
      </template>
    </MqttSplit>
    <dialog ref="subscriptionDialog" class="subscription-dialog" :aria-label="t('network.mqtt.subscribe')">
      <form class="subscription-form" @submit.prevent="addSubscription">
        <h2>{{ t("network.mqtt.subscribe") }}</h2>
        <label>{{ t("network.mqtt.topic") }}<input ref="subscriptionInput" v-model="filterTopic" class="field mono" :placeholder="t('network.mqtt.filterHint')" spellcheck="false" /></label>
        <label>{{ t("network.mqtt.qos") }}<AppSelect v-model="subscriptionQos" :options="qosOptions" :teleport-to="subscriptionDialog" /></label>
        <p v-if="filterTopic && !filterValid" class="validation">{{ t("network.mqtt.filterError") }}</p>
        <footer><button type="button" class="btn" @click="subscriptionDialog?.close()">{{ t("network.mqtt.cancelAction") }}</button><button class="btn primary" :disabled="busy || !filterValid || (status !== 'disconnected' && !connected)">{{ t(connected ? "network.mqtt.subscribe" : "network.mqtt.addTopic") }}</button></footer>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.mqtt { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; container-type: inline-size; }
.workspace-toolbar, .expanded-heading { display: flex; align-items: center; gap: 8px; flex-shrink: 0; min-width: 0; }
.connection-toggle { display: inline-flex; align-items: center; gap: 6px; min-width: 0; padding: 0; border: 0; background: none; color: var(--text); font-size: 13px; font-weight: 600; }
.connection-toggle span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.connection-toggle svg { flex-shrink: 0; transition: transform var(--dur) var(--ease-out); }
.connection-toggle svg.collapsed { transform: rotate(-90deg); }
.section-head { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; gap: 10px; min-height: 24px; }
h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; font-weight: 600; }
.hint, small { color: var(--text-3); font-size: 11px; }
.hint { margin: 0; line-height: 1.6; }
.status { display: flex; align-items: center; gap: 6px; margin-left: auto; color: var(--text-2); font-size: 12px; white-space: nowrap; }
.status i { width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); }
.status.online { color: var(--success); }
.status.online i { background: var(--success); }
.connection { display: flex; flex: none; flex-direction: column; padding-bottom: 10px; gap: 8px; border-bottom: 1px solid var(--border); }
.connection-fields { display: grid; grid-template-columns: 250px 110px 300px 170px; max-width: 866px; align-items: center; gap: 8px 12px; margin: 0; padding: 0; border: 0; min-width: 0; }
.connection-fields label:not(.check) { display: flex; flex-direction: row; align-items: center; gap: 8px; min-width: 0; color: var(--text-2); font-size: 12px; }
.connection-fields label > span { flex-shrink: 0; white-space: nowrap; }
.field { height: 30px; }
.password-options { display: flex; align-items: center; gap: 14px; grid-column: 2 / -1; flex-wrap: wrap; }
.password { flex: 0 1 240px; min-width: 160px !important; max-width: 240px; }
.validation { margin: 0; font-size: 12px; line-height: 1.5; color: var(--danger); overflow-wrap: anywhere; }
.subscriptions { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; padding: 10px 10px 0 0; overflow: hidden; }
.count { color: var(--text-3); font-size: 12px; }
.subscription-add { flex-shrink: 0; margin: 0; padding: 0 6px; font-size: 12px; }
.subscription-list { flex: 1; min-height: 0; overflow: auto; list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--border); }
.subscription-list li { display: flex; align-items: start; gap: 6px; padding: 9px 2px; border-bottom: 1px solid var(--border); }
.subscription-filter { display: flex; flex-direction: column; flex: 1; gap: 5px; min-width: 0; padding: 6px; border: 0; border-radius: 6px; background: none; color: var(--text); text-align: start; }
.subscription-filter:hover, .all-subscriptions:hover { background: var(--hover); }
.subscription-filter.selected, .all-subscriptions.selected { background: var(--accent-soft); color: var(--accent); }
.all-subscriptions { flex-shrink: 0; padding: 7px; margin-top: 6px; border: 0; border-radius: 6px; background: none; color: var(--text-2); text-align: start; font-size: 12px; }
code { font: 12px var(--font-mono); overflow-wrap: anywhere; }
.traffic-page { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; padding: 10px 0 0 12px; overflow: hidden; }
.publish-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.send-expanded .traffic-page { padding: 0; }
.publish-controls { display: flex; flex-shrink: 0; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 0; }
.publish-topic { flex: 1 1 240px; max-width: 560px; }
.publish-controls :deep(.qos-select) { width: 90px; flex: 0 0 90px; }
.publish-controls :deep(.mode-select) { width: 80px; flex: 0 0 80px; }
.payload { min-height: 0; flex: 1; }
.publish-error { flex-shrink: 0; padding-top: 4px; }
.subscription-dialog { width: min(420px, calc(100vw - 32px)); padding: 22px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
.subscription-dialog::backdrop { background: var(--modal-scrim); }
.subscription-form, .subscription-form label { display: flex; flex-direction: column; gap: 8px; }
.subscription-form { gap: 16px; }
.subscription-form label { font-size: 12px; color: var(--text-2); }
.subscription-form footer { display: flex; justify-content: flex-end; gap: 8px; }
@container (max-width: 900px) { .connection-fields { grid-template-columns: minmax(0, 250px) 100px minmax(0, 290px); max-width: 664px; } .credentials { grid-column: 2 / -1; max-width: 300px; } .password-options { grid-column: 1 / -1; } }
@container (max-width: 480px) { .connection-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } .credentials { grid-column: auto; } .password-options { gap: 8px; } .traffic-page { padding-left: 8px; } }
@media (max-height: 650px) { .connection { gap: 6px; padding-bottom: 6px; } .connection-fields { gap: 6px 10px; } .publish-controls { gap: 6px; padding: 6px 0; } }
@media (prefers-reduced-motion: reduce) { .connection-toggle svg { transition: none; } }
</style>
