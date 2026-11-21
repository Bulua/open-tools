<script setup lang="ts">
import { nextTick, onBeforeUnmount, onDeactivated, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { usePopover } from "@/composables/usePopover";
import type { ImageSizeTarget } from "../images";
import { imageWidth } from "../imageSize";

const props = defineProps<{ focusEditor: () => void }>();
const { t } = useI18n();
let disposed = false;
const imageAnchor = ref<HTMLElement>();
const imagePanel = ref<HTMLFormElement>();
const imageTarget = shallowRef<ImageSizeTarget>();
const imagePosition = ref({ left: "0px", top: "0px" });
const widthInput = ref<number | string>("");
const scales = [25, 50, 75, 100, 150, 200];
const { open: imageMenuOpen, style: imageMenuStyle, show: showImageMenu, close: closeImageMenu } =
  usePopover(imageAnchor, imagePanel, { minWidth: 210, maxHeight: 185, ignoreEscape: () => true });

async function openImageMenu(event: MouseEvent, target: ImageSizeTarget) {
  closeImageMenu();
  imageTarget.value = target;
  imagePosition.value = { left: `${event.clientX}px`, top: `${event.clientY}px` };
  widthInput.value = target.width ?? (target.naturalWidth || "");
  await nextTick();
  if (disposed || imageTarget.value !== target) return;
  await showImageMenu();
  const input = imagePanel.value?.querySelector("input");
  input?.focus({ preventScroll: true });
  input?.select();
}

function applyWidth(width: number | null) {
  const target = imageTarget.value;
  closeImageMenu();
  target?.resize(width);
}

function applyScale(scale: number) {
  const naturalWidth = imageTarget.value?.naturalWidth;
  if (naturalWidth) applyWidth(Math.max(1, Math.round(naturalWidth * scale / 100)));
}

function submitWidth() {
  const width = imageWidth(widthInput.value);
  if (width !== null) applyWidth(width);
}

function closeAndFocus() {
  closeImageMenu();
  props.focusEditor();
}

function closeWhenFocusLeaves(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && !imagePanel.value?.contains(event.relatedTarget)) closeImageMenu();
}

defineExpose({ open: openImageMenu });
onDeactivated(closeImageMenu);
onBeforeUnmount(() => { disposed = true; });
</script>

<template>
  <Teleport to="body">
    <span ref="imageAnchor" class="menu-anchor" :style="imagePosition" aria-hidden="true" />
    <Transition name="pop">
      <form v-if="imageMenuOpen" ref="imagePanel" class="image-menu" :style="imageMenuStyle"
        role="dialog" :aria-label="t('markdown.notebook.imageSize')" @submit.prevent="submitWidth"
        @keydown.esc.stop.prevent="closeAndFocus" @focusout="closeWhenFocusLeaves">
        <fieldset v-if="imageTarget?.naturalWidth" class="image-scale">
          <legend>{{ t("markdown.notebook.imageScale") }}</legend>
          <div class="image-presets">
            <button v-for="scale in scales" :key="scale" class="btn small" type="button" @click="applyScale(scale)">{{ scale }}%</button>
          </div>
        </fieldset>
        <label class="image-width">
          <span>{{ t("markdown.notebook.imageWidth") }}</span>
          <input v-model.number="widthInput" class="field" type="number" min="1" step="1" required />
        </label>
        <div class="image-menu-actions">
          <button class="btn small subtle" type="button" @click="applyWidth(null)">{{ t("markdown.notebook.imageAuto") }}</button>
          <button class="btn small primary" type="submit">{{ t("markdown.notebook.imageApply") }}</button>
        </div>
      </form>
    </Transition>
  </Teleport>
</template>

<style scoped>
.menu-anchor { position: fixed; pointer-events: none; }
.image-menu {
  position: fixed;
  z-index: 300;
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}
.image-scale { min-width: 0; margin: 0; padding: 0; border: 0; }
.image-scale legend { margin-bottom: 4px; padding: 0; color: var(--text-2); font-size: 12px; }
.image-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.image-presets .btn { justify-content: center; }
.image-width { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.image-width .field { flex: 1; min-width: 0; width: 6rem; height: 28px; }
.image-menu-actions { display: flex; justify-content: space-between; gap: 8px; }
</style>
