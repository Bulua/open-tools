<script setup lang="ts">
import { Sparkles } from "lucide-vue-next";

defineProps<{ title: string; description: string }>();
</script>

<template>
  <div class="empty-state">
    <div class="art"><Sparkles :size="34" /></div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}
.art {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
  margin-bottom: 16px;
}
h3 {
  margin: 0 0 6px;
  font-size: 16px;
}
p {
  margin: 0;
  max-width: 320px;
  color: var(--text-3);
  line-height: 1.6;
}
</style>
