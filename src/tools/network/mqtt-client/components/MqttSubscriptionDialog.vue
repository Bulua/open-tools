<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppSelect from "@/components/common/AppSelect.vue";
import { validTopic, type QoS } from "../mqtt";

const props = defineProps<{ active: boolean; connected: boolean; canSubmit: boolean; add: (topic: string, qos: QoS) => Promise<boolean> }>();
const subscriptionQos = defineModel<QoS>("qos", { required: true });
const { t } = useI18n();
const filterTopic = ref("");
const filterValid = computed(() => validTopic(filterTopic.value, true));
const qosOptions = computed(() => ([0, 1, 2] as const).map(value => ({ value, label: t("network.mqtt.qosValue", { n: value }), hint: t(`network.mqtt.qos${value}`) })));
const subscriptionDialog = ref<HTMLDialogElement>();
const subscriptionInput = ref<HTMLInputElement>();
const subscriptionClosing = ref(false);
let subscriptionAnimation: Animation | undefined;
let generation = 0;
const closeSubscription = (immediate = false) => {
  const dialog = subscriptionDialog.value;
  if (immediate) {
    generation++;
    subscriptionAnimation?.cancel(); subscriptionAnimation = undefined;
    subscriptionClosing.value = false; dialog?.close();
    return;
  }
  if (!dialog?.open || subscriptionClosing.value) return;
  generation++;
  if (!dialog.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { dialog.close(); return; }
  // 关闭时保持原生对话框及输入内容，位移结束后再移出顶层，避免裁剪与 display 切换造成卡顿。
  const style = getComputedStyle(dialog);
  const duration = style.getPropertyValue("--dur-fast").trim() || "120ms";
  const animation = dialog.animate([{ transform: style.transform }, { transform: "translateY(6px)" }], {
    duration: parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000),
    easing: style.getPropertyValue("--ease-out").trim() || "ease-out", fill: "forwards",
  });
  subscriptionClosing.value = true;
  subscriptionAnimation = animation;
  void animation.finished.then(() => {
    if (subscriptionAnimation !== animation) return;
    subscriptionAnimation = undefined;
    dialog.close(); animation.cancel(); subscriptionClosing.value = false;
  }).catch(() => { /* 切换连接或卸载时取消动画，由即时关闭路径清理。 */ });
};
const open = async () => {
  closeSubscription(true);
  filterTopic.value = "";
  const current = generation;
  await nextTick();
  if (!props.active || generation !== current) return;
  subscriptionDialog.value?.showModal(); await nextTick(); subscriptionInput.value?.focus(); subscriptionInput.value?.select();
};
onDeactivated(() => closeSubscription(true));
onBeforeUnmount(() => closeSubscription(true));
watch(() => props.active, active => { if (!active) closeSubscription(true); });
const submit = async () => {
  if (!props.canSubmit || !filterValid.value || subscriptionClosing.value) return;
  const current = generation;
  if (await props.add(filterTopic.value, subscriptionQos.value) && generation === current) closeSubscription();
};
defineExpose({ open });
</script>

<template>
  <dialog ref="subscriptionDialog" class="subscription-dialog" @cancel.prevent="closeSubscription()" :aria-label="t('network.mqtt.subscribe')">
    <form class="subscription-form" :inert="subscriptionClosing ? true : undefined" @submit.prevent="submit">
      <h2>{{ t("network.mqtt.subscribe") }}</h2>
      <label>{{ t("network.mqtt.topic") }}<input ref="subscriptionInput" v-model="filterTopic" class="field mono" :aria-invalid="!filterValid" :title="!filterValid ? t('network.mqtt.filterError') : undefined" :placeholder="t('network.mqtt.filterHint')" spellcheck="false" /></label>
      <p class="hint">{{ t("network.mqtt.wildcardHint") }}</p>
      <label>{{ t("network.mqtt.qos") }}<AppSelect v-model="subscriptionQos" :options="qosOptions" :teleport-to="subscriptionDialog" /></label>
      <footer><button type="button" class="btn" @click="closeSubscription()">{{ t("network.mqtt.cancelAction") }}</button><button class="btn primary" :disabled="!canSubmit || !filterValid">{{ t(connected ? "network.mqtt.subscribe" : "network.mqtt.addTopic") }}</button></footer>
    </form>
  </dialog>
</template>

<style scoped>
h2 { margin: 0; font-size: 12px; font-weight: 600; }
.hint { margin: 0; color: var(--text-3); font-size: 11px; line-height: 1.7; }
.subscription-dialog { width: min(440px, calc(100vw - 32px)); padding: 26px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
.subscription-dialog::backdrop { background: var(--modal-scrim); }
/* 仅在打开时做轻微位移；关闭由动画完成回调控制，避免顶层裁剪与离散 display 过渡叠加。 */
.subscription-dialog[open] { animation: mqtt-subscription-open var(--dur-fast) var(--ease-out); }
@keyframes mqtt-subscription-open { from { transform: translateY(6px); } to { transform: translateY(0); } }
.subscription-form, .subscription-form label { display: flex; flex-direction: column; gap: 8px; }
.subscription-form { gap: 18px; }
.subscription-form label { font-size: 12px; color: var(--text-2); }
.subscription-form footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
