<script setup lang="ts">
import { Moon, Sun, Boxes } from "lucide-vue-next";
import type { Category } from "../tools";

defineProps<{ categories: Category[]; activeId: string; theme: "light" | "dark" }>();
defineEmits<{ select: [id: string]; toggleTheme: [] }>();
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="logo"><Boxes :size="18" /></div>
      <div class="brand-text">
        <span class="name">Open Tools</span>
        <span class="sub">工具百宝箱</span>
      </div>
    </div>

    <nav class="tabs">
      <button
        v-for="c in categories"
        :key="c.id"
        class="tab"
        :class="{ active: c.id === activeId }"
        @click="$emit('select', c.id)"
      >
        <component :is="c.icon" :size="16" />
        <span>{{ c.name }}</span>
        <span class="count">{{ c.tools.length }}</span>
      </button>
    </nav>

    <div class="actions">
      <button class="icon-btn" :title="theme === 'dark' ? '切换到浅色' : '切换到深色'" @click="$emit('toggleTheme')">
        <Sun v-if="theme === 'dark'" :size="18" />
        <Moon v-else :size="18" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: 60px;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 240px 1fr auto;
  align-items: center;
  padding: 0 20px 0 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 20px;
}
.logo {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.2px;
}
.sub {
  font-size: 11px;
  color: var(--text-3);
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  justify-self: start;
}
.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-2);
  font-weight: 500;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  background: var(--surface);
  color: var(--accent-text);
  box-shadow: var(--shadow);
}
.count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  background: var(--border);
  color: var(--text-2);
}
.tab.active .count {
  background: var(--accent-soft);
  color: var(--accent-text);
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-2);
  transition: color 0.15s, border-color 0.15s;
}
.icon-btn:hover {
  color: var(--accent-text);
  border-color: var(--accent);
}
</style>
