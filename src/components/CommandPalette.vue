<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { CornerDownLeft, Search } from "lucide-vue-next";
import type { Category, Tool } from "../tools";

const props = defineProps<{ categories: Category[] }>();
const emit = defineEmits<{ pick: [categoryId: string, toolId: string]; close: [] }>();

const keyword = ref("");
const cursor = ref(0);
const inputEl = ref<HTMLInputElement>();
const listEl = ref<HTMLElement>();

interface Hit {
  category: Category;
  tool: Tool;
}

// 跨所有分类搜索，按分类分组展示
const groups = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  return props.categories
    .map((c) => ({
      category: c,
      tools: c.tools.filter((t) => !k || (t.name + t.desc + t.id + c.name).toLowerCase().includes(k)),
    }))
    .filter((g) => g.tools.length);
});

const flat = computed<Hit[]>(() =>
  groups.value.flatMap((g) => g.tools.map((tool) => ({ category: g.category, tool }))),
);

watch(keyword, () => (cursor.value = 0));
watch(cursor, async (i) => {
  await nextTick();
  listEl.value?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({ block: "nearest" });
});

nextTick(() => inputEl.value?.focus());

const pick = (hit?: Hit) => hit && emit("pick", hit.category.id, hit.tool.id);

const onKey = (e: KeyboardEvent) => {
  const n = flat.value.length;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    cursor.value = n ? (cursor.value + 1) % n : 0;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    cursor.value = n ? (cursor.value - 1 + n) % n : 0;
  } else if (e.key === "Enter") {
    pick(flat.value[cursor.value]);
  } else if (e.key === "Escape") {
    emit("close");
  }
};

const indexOf = (tool: Tool) => flat.value.findIndex((h) => h.tool === tool);
</script>

<template>
  <div class="overlay" @mousedown.self="$emit('close')">
    <div class="palette" @keydown="onKey">
      <label class="input">
        <Search :size="16" />
        <input ref="inputEl" v-model="keyword" placeholder="搜索所有工具…" />
        <kbd>Esc</kbd>
      </label>

      <div ref="listEl" class="results">
        <template v-for="g in groups" :key="g.category.id">
          <div class="group">{{ g.category.name }}</div>
          <button
            v-for="t in g.tools"
            :key="t.id"
            :data-index="indexOf(t)"
            class="hit"
            :class="{ active: indexOf(t) === cursor }"
            @mousemove="cursor = indexOf(t)"
            @click="pick({ category: g.category, tool: t })"
          >
            <component :is="t.icon" :size="16" :stroke-width="1.75" class="icon" />
            <span class="name">{{ t.name }}</span>
            <span class="desc">{{ t.desc }}</span>
            <CornerDownLeft v-if="indexOf(t) === cursor" :size="14" class="enter" />
          </button>
        </template>
        <p v-if="!flat.length" class="none">没有找到「{{ keyword }}」相关的工具</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(20, 20, 19, 0.28);
  animation: fade 0.12s ease-out;
}
.palette {
  width: min(600px, calc(100% - 48px));
  max-height: 64vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: pop 0.14s ease-out;
}
.input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: 52px;
  border-bottom: 1px solid var(--border);
  color: var(--text-3);
}
.input input {
  flex: 1;
  border: none;
  outline: none;
  background: none;
  font-size: 15px;
  color: var(--text);
}
.input input::placeholder {
  color: var(--text-3);
}
.results {
  overflow-y: auto;
  padding: 6px;
}
.group {
  padding: 10px 10px 4px;
  font-size: 12px;
  color: var(--text-3);
}
.hit {
  width: 100%;
  height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: none;
  text-align: left;
  color: var(--text-2);
}
.hit.active {
  background: var(--active);
  color: var(--text);
}
.hit.active .icon {
  color: var(--accent);
}
.icon {
  flex-shrink: 0;
}
.name {
  flex-shrink: 0;
}
.desc {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.enter {
  color: var(--text-3);
}
.none {
  margin: 0;
  padding: 24px;
  text-align: center;
  color: var(--text-3);
}

@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.99);
  }
}
</style>
