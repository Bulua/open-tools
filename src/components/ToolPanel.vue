<script setup lang="ts">
import { ref } from "vue";
import { ArrowDownUp, Check, ClipboardPaste, Copy, X } from "lucide-vue-next";
import type { Tool, ToolAction } from "../tools";
import EmptyState from "./EmptyState.vue";

defineProps<{ tool: Tool; categoryName: string }>();

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
      <div class="crumb">{{ categoryName }}</div>
      <h1>{{ tool.name }}</h1>
      <p>{{ tool.desc }}</p>
    </header>

    <EmptyState
      v-if="!tool.actions"
      title="即将上线"
      :description="`「${tool.name}」还在打磨中，很快就能在这里使用。`"
    />

    <div v-else class="workspace">
      <section class="box">
        <div class="box-head">
          <span>输入</span>
          <div class="box-tools">
            <button title="粘贴" @click="paste"><ClipboardPaste :size="14" /></button>
            <button title="清空" @click="clear"><X :size="14" /></button>
          </div>
        </div>
        <textarea v-model="input" spellcheck="false" :placeholder="tool.inputPlaceholder ?? '输入或粘贴内容'" />
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
        <button class="btn subtle" title="交换输入与输出" @click="swap">
          <ArrowDownUp :size="14" />
          交换
        </button>
      </div>

      <section class="box output">
        <div class="box-head">
          <span>输出</span>
          <div class="box-tools">
            <button :class="{ ok: copied }" title="复制" @click="copy">
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
            </button>
          </div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <textarea v-else v-model="output" readonly spellcheck="false" placeholder="结果会显示在这里" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.panel {
  flex: 1;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 480px;
}

.head {
  padding: 8px 0 24px;
}
.crumb {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 6px;
}
h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.3px;
}
.head p {
  margin: 6px 0 0;
  color: var(--text-2);
}

.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.box {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 140px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.box:focus-within {
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}
.box.output {
  background: var(--bg-sunken);
  box-shadow: none;
}
.box-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 0 16px;
  font-size: 12px;
  color: var(--text-3);
}
.box-tools {
  display: flex;
  gap: 2px;
}
.box-tools button {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
}
.box-tools button:hover {
  background: var(--hover);
  color: var(--text);
}
.box-tools button.ok {
  color: var(--success);
}

textarea {
  flex: 1;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: 6px 16px 14px;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
}
textarea::placeholder {
  color: var(--text-3);
  font-family: var(--font-sans);
}

.error {
  margin: 0;
  padding: 6px 16px 14px;
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
  height: 32px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s, border-color 0.15s;
}
.btn:hover {
  background: var(--hover);
}
.btn:active {
  transform: translateY(1px);
}
.btn.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.btn.subtle {
  border-color: transparent;
  background: none;
  color: var(--text-2);
}
.btn.subtle:hover {
  background: var(--hover);
  color: var(--text);
}
</style>
