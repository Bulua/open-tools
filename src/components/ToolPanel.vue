<script setup lang="ts">
import { ref } from "vue";
import { Copy, Check, Trash2, ArrowDownUp, ClipboardPaste } from "lucide-vue-next";
import type { Tool, ToolAction } from "../tools";
import EmptyState from "./EmptyState.vue";

const props = defineProps<{ tool: Tool }>();

const input = ref("");
const output = ref("");
const error = ref("");
const copied = ref(false);

const run = async (action: ToolAction) => {
  error.value = "";
  try {
    output.value = await action.run(input.value);
  } catch (e) {
    output.value = "";
    error.value = `${action.label}失败：${e instanceof Error ? e.message : String(e)}`;
  }
};

const copy = async () => {
  if (!output.value) return;
  await navigator.clipboard.writeText(output.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
};

const paste = async () => {
  input.value = await navigator.clipboard.readText();
};

const swap = () => {
  [input.value, output.value] = [output.value, input.value];
  error.value = "";
};

const clear = () => {
  input.value = output.value = error.value = "";
};
</script>

<template>
  <div class="panel">
    <header class="head">
      <div class="head-icon"><component :is="props.tool.icon" :size="22" /></div>
      <div>
        <h2>{{ tool.name }}</h2>
        <p>{{ tool.desc }}</p>
      </div>
    </header>

    <EmptyState
      v-if="!tool.actions"
      title="工具开发中"
      :description="`「${tool.name}」即将上线，界面与功能正在设计中。`"
    />

    <div v-else class="workspace">
      <section class="card">
        <div class="card-head">
          <span class="label">输入</span>
          <div class="tools">
            <button class="ghost" title="粘贴" @click="paste"><ClipboardPaste :size="15" /></button>
            <button class="ghost" title="清空" @click="clear"><Trash2 :size="15" /></button>
          </div>
        </div>
        <textarea v-model="input" spellcheck="false" :placeholder="tool.inputPlaceholder ?? '在此输入或粘贴内容…'" />
      </section>

      <div class="bar">
        <button
          v-for="a in tool.actions"
          :key="a.label"
          class="btn"
          :class="{ primary: a.primary }"
          @click="run(a)"
        >
          {{ a.label }}
        </button>
        <span class="spacer" />
        <button class="btn" title="交换输入与输出" @click="swap"><ArrowDownUp :size="15" />交换</button>
      </div>

      <section class="card">
        <div class="card-head">
          <span class="label">输出</span>
          <div class="tools">
            <button class="ghost" :class="{ ok: copied }" title="复制" @click="copy">
              <Check v-if="copied" :size="15" />
              <Copy v-else :size="15" />
            </button>
          </div>
        </div>
        <div v-if="error" class="error">{{ error }}</div>
        <textarea v-else v-model="output" readonly spellcheck="false" placeholder="结果将显示在这里" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 460px;
}

.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--accent-text);
  background: var(--accent-soft);
}
h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
}
.head p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-3);
}

.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 140px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.card:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.card-head {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.5px;
}
.tools {
  display: flex;
  gap: 2px;
}
.ghost {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-3);
}
.ghost:hover {
  background: var(--border);
  color: var(--text);
}
.ghost.ok {
  color: #30a46c;
}

textarea {
  flex: 1;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: 12px 14px;
  background: transparent;
  font-family: "Cascadia Code", Consolas, "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
}
textarea::placeholder {
  color: var(--text-3);
}

.error {
  padding: 12px 14px;
  color: var(--danger);
  font-size: 13px;
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.spacer {
  flex: 1;
}
.btn {
  height: 34px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-weight: 500;
  transition: border-color 0.15s, color 0.15s, transform 0.05s, filter 0.15s;
}
.btn:hover {
  border-color: var(--accent);
  color: var(--accent-text);
}
.btn:active {
  transform: translateY(1px);
}
.btn.primary {
  border-color: transparent;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}
.btn.primary:hover {
  filter: brightness(1.08);
}
</style>
