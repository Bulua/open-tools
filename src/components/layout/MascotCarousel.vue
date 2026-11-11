<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mascotAnimations as cats } from "./mascotAnimations";

const { t } = useI18n();
const INTERVAL = 5000;
const selected = ref(0);
const nextLabel = computed(() => t("home.mascotAction", { action: t(`home.mascotActions.${cats[(selected.value + 1) % cats.length].id}`) }));
const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const reduced = ref(motion?.matches ?? false);
let timer: ReturnType<typeof setInterval> | undefined;
let active = false;
let hovered = false;
let focused = false;

const advance = () => { selected.value = (selected.value + 1) % cats.length; };
function schedule() {
  clearInterval(timer);
  if (active && !reduced.value && !hovered && !focused) timer = setInterval(advance, INTERVAL);
}
function next() { advance(); schedule(); }
function pointer(inside: boolean) { hovered = inside; schedule(); }
function focus(event: FocusEvent) {
  if (event.type === "focusin") focused = (event.target as HTMLElement).matches(":focus-visible");
  else if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) focused = false;
  schedule();
}
function start() { active = true; schedule(); }
function stop() {
  active = false;
  hovered = false;
  focused = false;
  clearInterval(timer);
}
function motionChange(event: MediaQueryListEvent) { reduced.value = event.matches; schedule(); }
onMounted(() => { motion?.addEventListener?.("change", motionChange); start(); });
onActivated(start);
onDeactivated(stop);
onBeforeUnmount(() => { stop(); motion?.removeEventListener?.("change", motionChange); });
</script>

<template>
  <section class="mascot-carousel" :aria-label="t('home.mascot')" @pointerenter="pointer(true)" @pointerleave="pointer(false)" @focusin="focus" @focusout="focus">
    <button class="mascot-main" :aria-label="nextLabel" :title="nextLabel" @click="next">
      <span class="mascot-stage">
        <Transition name="mascot-slide" :css="!reduced">
          <picture :key="cats[selected].id" class="mascot-picture">
            <source media="(prefers-reduced-motion: reduce)" :srcset="cats[selected].still" />
            <img :src="cats[selected].animated" alt="" width="160" height="152" draggable="false" />
          </picture>
        </Transition>
      </span>
    </button>
    <p class="mascot-caption">{{ t(`home.mascotActions.${cats[selected].id}`) }}</p>
  </section>
</template>

<style scoped>
.mascot-carousel {
  display: grid;
  justify-items: center;
  width: 100%;
  min-width: 0;
}
.mascot-main {
  width: 160px;
  max-width: 100%;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  cursor: pointer;
}
.mascot-main:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.mascot-stage {
  display: block;
  position: relative;
  width: 100%;
  aspect-ratio: 160 / 152;
  overflow: hidden;
}
.mascot-picture {
  position: absolute;
  inset: 0;
  display: block;
}
.mascot-picture img {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
.mascot-slide-enter-active, .mascot-slide-leave-active {
  transition: transform var(--dur-slow) var(--ease-out);
}
.mascot-slide-enter-from { transform: translateX(100%); }
.mascot-slide-leave-to { transform: translateX(-100%); }
.mascot-caption {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: 12px;
}
@media (prefers-reduced-motion: reduce) {
  .mascot-slide-enter-active, .mascot-slide-leave-active { transition: none; }
}
</style>
