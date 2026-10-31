<script setup lang="ts">
import { onMounted } from "vue";
import { CircleAlert, CircleCheck, LoaderCircle, X } from "lucide-vue-next";
import { useUpdater } from "@/composables/useUpdater";

/** 检查更新对话框：显示当前版本、新版本说明、下载进度 */
const emit = defineEmits<{ close: [] }>();
const { supported, status, currentVersion, newVersion, notes, progress, error, checkForUpdate, installUpdate, loadCurrentVersion } =
  useUpdater();

onMounted(() => {
  loadCurrentVersion();
  // 打开对话框时，如果还没检查过或上次出错，就检查一次
  if (status.value === "idle" || status.value === "error" || status.value === "latest") checkForUpdate();
});

const busy = () => status.value === "downloading" || status.value === "installing";
const close = () => !busy() && emit("close");
</script>

<template>
  <div class="overlay" @mousedown.self="close">
    <div class="dialog" role="dialog" aria-label="检查更新" @keydown.esc="close">
      <header class="head">
        <h2>检查更新</h2>
        <button class="icon-btn" title="关闭" :disabled="busy()" @click="close"><X :size="16" /></button>
      </header>

      <div class="body">
        <p class="version">当前版本 <b>{{ supported ? `v${currentVersion || "…"}` : "开发预览" }}</b></p>

        <p v-if="!supported" class="state">在线更新只在安装后的桌面版中可用。</p>

        <p v-else-if="status === 'checking'" class="state"><LoaderCircle :size="16" class="spin" />正在检查新版本…</p>

        <p v-else-if="status === 'latest'" class="state ok"><CircleCheck :size="16" />已是最新版本</p>

        <template v-else-if="status === 'available'">
          <p class="state accent">发现新版本 <b>v{{ newVersion }}</b></p>
          <div v-if="notes" class="notes">{{ notes }}</div>
        </template>

        <template v-else-if="status === 'downloading' || status === 'installing'">
          <p class="state">
            <LoaderCircle :size="16" class="spin" />
            {{ status === "downloading" ? `正在下载 v${newVersion}… ${progress}%` : "下载完成，正在安装，程序会自动重启" }}
          </p>
          <div class="bar"><i :style="{ width: `${status === 'installing' ? 100 : progress}%` }" /></div>
        </template>

        <p v-else-if="status === 'error'" class="state bad"><CircleAlert :size="16" />{{ error }}</p>
      </div>

      <footer class="foot">
        <template v-if="status === 'available'">
          <button class="btn subtle" @click="close">稍后</button>
          <button class="btn primary" @click="installUpdate">立即更新</button>
        </template>
        <button v-else-if="status === 'error'" class="btn primary" @click="checkForUpdate()">重试</button>
        <button v-else-if="!busy()" class="btn" @click="close">关闭</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(20, 20, 19, 0.28);
}
.dialog {
  width: min(440px, calc(100% - 48px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px 6px 20px;
}
h2 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 400;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 6px 20px 16px;
}
.version {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}
.version b {
  font-weight: 500;
  color: var(--text-2);
}
.state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
}
.state.ok {
  color: var(--success);
}
.state.bad {
  color: var(--danger);
  align-items: flex-start;
}
.state.accent b {
  color: var(--accent);
  font-weight: 600;
}
.notes {
  max-height: 200px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-sunken);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  user-select: text;
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: var(--active);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-sunken);
}
.foot:empty {
  display: none;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
