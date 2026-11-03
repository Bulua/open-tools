<script setup lang="ts">
import { onActivated, ref } from "vue";
import type { Tool } from "@/tools/types";
import ToolSession from "./ToolSession.vue";
import SessionTabs, { type Session } from "./SessionTabs.vue";

/**
 * 右侧工具区：顶部一条工具栏 + 下方工作区。
 *
 * 工具栏左边是工具图标、名称和一句说明，右边留给工具放选项：
 * 工具组件里用 <ToolActions>…</ToolActions> 把选项放到这里（参考 JsonFormat.vue）。
 *
 * 工具定义了 sessions: true 时，工作区上方显示会话标签栏。
 * 每个会话是一个独立的工具实例，切换时只是隐藏，内容都会保留；关闭会话才会销毁。
 */
const props = defineProps<{ tool: Tool }>();

const MAX_SESSIONS = 10;
let nextId = 1;
const newSession = (): Session => ({ id: nextId++, name: "" });

const sessions = ref<Session[]>([newSession()]);
const activeId = ref(sessions.value[0].id);

const addSession = () => {
  if (sessions.value.length >= MAX_SESSIONS) return;
  const s = newSession();
  sessions.value.push(s);
  activeId.value = s.id;
};

const closeSession = (id: number) => {
  const index = sessions.value.findIndex((s) => s.id === id);
  if (index < 0) return;
  // 关闭最后一个会话时，换成一个新的空会话
  if (sessions.value.length === 1) {
    nextId = 1;
    sessions.value = [newSession()];
    activeId.value = sessions.value[0].id;
    return;
  }
  sessions.value.splice(index, 1);
  if (activeId.value === id) activeId.value = sessions.value[Math.min(index, sessions.value.length - 1)].id;
};

// 切换到这个工具时，工作区从下方轻轻滑上来；标题栏和选项不动，避免选项跟着晃
const workspace = ref<HTMLElement>();
onActivated(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  workspace.value?.animate([{ transform: "translateY(10px)" }, { transform: "none" }], {
    duration: 300,
    easing: "cubic-bezier(0.32, 0.72, 0, 1)",
  });
});

const renameSession = (id: number, name: string) => {
  const s = sessions.value.find((x) => x.id === id);
  if (s) s.name = name;
};
</script>

<template>
  <div class="tool-view">
    <header class="bar">
      <span class="icon"><component :is="props.tool.icon" :size="16" :stroke-width="1.75" /></span>
      <div class="title">
        <h1>{{ tool.name }}</h1>
        <p :title="tool.desc">{{ tool.desc }}</p>
      </div>
      <div id="tool-actions" class="actions" />
    </header>

    <div v-if="tool.sessions" class="session-bar">
      <SessionTabs
        :sessions="sessions"
        :active-id="activeId"
        :max="MAX_SESSIONS"
        @select="activeId = $event"
        @add="addSession"
        @close="closeSession"
        @rename="renameSession"
      />
    </div>

    <div ref="workspace" class="workspace">
      <template v-if="tool.sessions">
        <div v-for="s in sessions" v-show="s.id === activeId" :key="s.id" class="session">
          <ToolSession :tool="tool" :active="s.id === activeId" />
        </div>
      </template>
      <ToolSession v-else :tool="tool" />
    </div>
  </div>
</template>

<style scoped>
.tool-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 工具栏：一行放下名称、说明和选项；空间不够时右侧选项自动换到第二行 */
.bar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-height: 56px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
}
.title {
  flex: 1 1 200px;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
h1 {
  flex-shrink: 0;
  margin: 0;
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 400;
  letter-spacing: -0.2px;
  white-space: nowrap;
}
.title p {
  min-width: 0;
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 12px;
  margin-left: auto;
}
.actions:empty {
  display: none;
}

/* 会话标签栏：贴在工作区上方 */
.session-bar {
  flex-shrink: 0;
  padding: 8px 24px 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}

/* 工作区：铺满剩余空间 */
.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 24px 20px;
  overflow: auto;
}
.session {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
