<script setup lang="ts">
import { computed, nextTick, onDeactivated, ref, useId, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { usePopover } from "@/composables/usePopover";
import { validTopic } from "../mqtt";

const props = defineProps<{ topics: string[]; active: boolean }>();
const model = defineModel<string>({ required: true });
const { t } = useI18n();
const id = useId();
const trigger = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const input = ref<HTMLInputElement>();
const { open, style, show, close } = usePopover(trigger, panel, { maxHeight: 240 });
const query = ref("");
const cursor = ref(-1);
const options = computed(() => [...new Set(props.topics)].filter(topic => validTopic(topic) && topic.includes(query.value)));
const activeId = computed(() => open.value && cursor.value >= 0 && cursor.value < options.value.length ? `${id}-option-${cursor.value}` : undefined);
const showOptions = async (all = false, value = model.value) => {
  if (!props.active) return;
  query.value = all ? "" : value;
  cursor.value = -1;
  await show();
};
const toggle = () => {
  input.value?.focus();
  if (open.value) close();
  else void showOptions(true);
};
const search = (event: Event) => {
  if (!(event as InputEvent).isComposing) void showOptions(false, (event.target as HTMLInputElement).value);
};
const pick = (topic: string) => {
  model.value = topic;
  close();
  input.value?.focus();
};
const keydown = async (event: KeyboardEvent) => {
  if (event.isComposing) return;
  if (event.key === "Tab") { close(); return; }
  if (event.key === "Escape") { event.preventDefault(); close(); return; }
  if (event.key === "Enter") {
    if (open.value && options.value[cursor.value] !== undefined) {
      event.preventDefault(); pick(options.value[cursor.value]);
    } else close();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  if (!open.value) await showOptions(true);
  const count = options.value.length;
  if (!count) return;
  cursor.value = cursor.value < 0 ? (event.key === "ArrowDown" ? 0 : count - 1) : (cursor.value + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
  await nextTick();
  panel.value?.querySelector<HTMLElement>(`[id="${id}-option-${cursor.value}"]`)?.scrollIntoView?.({ block: "nearest" });
};
const blur = (event: FocusEvent) => {
  const target = event.relatedTarget as Node | null;
  if (!target || (!trigger.value?.contains(target) && !panel.value?.contains(target))) close();
};
watch(() => props.active, active => { if (!active) close(); });
onDeactivated(close);
</script>

<template>
  <div ref="trigger" class="topic-combobox" @focusout="blur">
    <input ref="input" v-model="model" class="field mono publish-topic" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open ? `${id}-topics` : undefined" :aria-activedescendant="activeId" :aria-invalid="!validTopic(model)" :aria-label="t('network.mqtt.topic')" :title="t('network.mqtt.topic')" :placeholder="t('network.mqtt.publishHint')" spellcheck="false" autocomplete="off" @input="search" @keydown="keydown" />
    <button type="button" class="icon-btn topic-toggle" :aria-label="t('network.mqtt.chooseTopic')" :title="t('network.mqtt.chooseTopic')" :aria-expanded="open" @pointerdown.prevent @click="toggle"><ChevronDown :size="14" :class="{ expanded: open }" /></button>
  </div>
  <Teleport to="body">
    <Transition name="pop">
      <div v-if="open" ref="panel" class="select-menu topic-menu" :style="style" @pointerdown.prevent>
        <div :id="`${id}-topics`" class="options" role="listbox" :aria-label="t('network.mqtt.chooseTopic')">
          <div v-for="(topic, index) in options" :id="`${id}-option-${index}`" :key="topic" class="option" :class="{ active: cursor === index, selected: model === topic }" role="option" :aria-selected="model === topic" @mouseenter="cursor = index" @click="pick(topic)"><span class="text mono" :title="topic">{{ topic }}</span></div>
          <p v-if="!options.length" class="empty">{{ t("network.mqtt.noTopics") }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.topic-combobox { position: relative; flex: 0 1 320px; width: 320px; max-width: 100%; min-width: 0; }
.publish-topic { padding-inline-end: 36px; }
.topic-toggle { position: absolute; inset-inline-end: 4px; top: 50%; transform: translateY(-50%); }
.topic-toggle svg { transition: transform var(--dur) var(--ease-out); }
.topic-toggle svg.expanded { transform: rotate(180deg); }
.topic-menu { max-width: calc(100vw - 16px); }
.topic-menu .options { max-height: 220px; }
</style>
