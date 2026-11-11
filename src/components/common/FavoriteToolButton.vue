<script setup lang="ts">
import { computed } from "vue";
import { Star } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { favoriteToolIds, toggleFavorite } from "@/composables/toolLibrary";

const props = defineProps<{ toolId: string }>();
const { t } = useI18n();
const selected = computed(() => favoriteToolIds.value.includes(props.toolId));
const label = computed(() => t(selected.value ? "home.unfavorite" : "home.favorite"));
</script>

<template>
  <button class="favorite-button" :class="{ selected }" :title="label" :aria-label="label" :aria-pressed="selected" @click="toggleFavorite(toolId)"><Star :size="16" /></button>
</template>

<style scoped>
.favorite-button {
  display: inline-flex;
  align-self: center;
  flex-shrink: 0;
  padding: 5px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
  cursor: pointer;
  transition: color var(--dur) var(--ease-out), background var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
}
.favorite-button:hover {
  background: var(--hover);
}
.favorite-button:active {
  transform: scale(0.92);
}
.favorite-button.selected {
  color: var(--accent);
}
.favorite-button.selected svg {
  fill: var(--accent-soft);
}
.favorite-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .favorite-button {
    transition: none;
  }
}
</style>
