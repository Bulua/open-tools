<script setup lang="ts">
defineProps<{ title: string; description: string }>();
</script>

<template>
  <div class="empty-state">
    <span class="mark" />
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
}
.mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--accent);
  opacity: 0.85;
  transform: rotate(45deg);
  margin-bottom: 24px;
}
h3 {
  margin: 0 0 8px;
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 400;
}
p {
  margin: 0;
  max-width: 340px;
  color: var(--text-2);
  line-height: 1.7;
}
</style>
