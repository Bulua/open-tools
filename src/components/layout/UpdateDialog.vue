<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { CircleAlert, CircleCheck, LoaderCircle, RefreshCw, X } from "lucide-vue-next";
import { Translation, useI18n } from "vue-i18n";
import { useUpdater } from "@/composables/useUpdater";
import { locale } from "@/locales";

/**
 * 更新对话框：显示当前版本、新版本的更新内容、下载进度。
 * 自动检查发现新版本时弹出，点右上角的更新按钮也打开它；已是最新版本时显示当前版本的更新内容。
 */
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const {
  supported,
  status,
  currentVersion,
  newVersion,
  notes,
  currentNotes,
  progress,
  error,
  lastChecked,
  checkForUpdate,
  installUpdate,
  skipVersion,
  loadCurrentVersion,
  loadCurrentNotes,
} = useUpdater();

onMounted(() => {
  loadCurrentVersion();
  // 打开对话框时，如果还没检查过或上次出错，就检查一次
  if (status.value === "idle" || status.value === "error" || status.value === "latest") checkForUpdate();
});
watch(status, (s) => s === "latest" && loadCurrentNotes(), { immediate: true });

const busy = () => status.value === "downloading" || status.value === "installing";
/** 可以手动重新检查：正在检查、下载、安装时不行 */
const canRecheck = computed(() => supported && !busy() && status.value !== "checking");
const checkedAt = computed(() => (lastChecked.value ? new Date(lastChecked.value).toLocaleTimeString(locale.value) : ""));
const close = () => !busy() && emit("close");
</script>

<template>
  <div class="overlay" @mousedown.self="close">
    <div class="dialog" role="dialog" :aria-label="t('update.title')" @keydown.esc="close">
      <header class="head">
        <h2>{{ status === "available" ? t("update.found") : t("update.title") }}</h2>
        <div class="head-actions">
          <button v-if="supported" class="icon-btn" :class="{ spinning: status === 'checking' }" :title="t('update.recheck')" :disabled="!canRecheck" @click="checkForUpdate()">
            <RefreshCw :size="15" />
          </button>
          <button class="icon-btn" :title="t('update.close')" :disabled="busy()" @click="close"><X :size="16" /></button>
        </div>
      </header>

      <div class="body">
        <p class="version">
          {{ t("update.current") }} <b>{{ supported ? `v${currentVersion || "…"}` : t("update.devPreview") }}</b>
          <span v-if="checkedAt && status !== 'checking'" class="checked">{{ t("update.checkedAt", { time: checkedAt }) }}</span>
        </p>

        <p v-if="!supported" class="state">{{ t("update.unsupported") }}</p>

        <p v-else-if="status === 'checking'" class="state"><LoaderCircle :size="16" class="spin" />{{ t("update.checking") }}</p>

        <template v-else-if="status === 'latest'">
          <p class="state ok"><CircleCheck :size="16" />{{ t("update.upToDate") }}</p>
          <template v-if="currentNotes">
            <h3>{{ t("update.currentNotes") }}</h3>
            <div class="notes">{{ currentNotes }}</div>
          </template>
        </template>

        <template v-else-if="status === 'available'">
          <Translation keypath="update.released" tag="p" class="state accent">
            <template #version><b>v{{ newVersion }}</b></template>
          </Translation>
          <h3>{{ t("update.notes") }}</h3>
          <div class="notes">{{ notes || t("update.noNotes") }}</div>
        </template>

        <template v-else-if="status === 'downloading' || status === 'installing'">
          <p class="state">
            <LoaderCircle :size="16" class="spin" />
            {{ status === "downloading" ? t("update.downloading", { version: newVersion, progress }) : t("update.installing") }}
          </p>
          <div class="bar"><i :style="{ width: `${status === 'installing' ? 100 : progress}%` }" /></div>
        </template>

        <p v-else-if="status === 'error'" class="state bad"><CircleAlert :size="16" />{{ error }}</p>
      </div>

      <footer class="foot">
        <template v-if="status === 'available'">
          <button class="btn subtle skip" :title="t('update.skipTitle')" @click="skipVersion">{{ t("update.skip") }}</button>
          <button class="btn subtle" @click="close">{{ t("update.later") }}</button>
          <button class="btn primary" @click="installUpdate">{{ t("update.install") }}</button>
        </template>
        <button v-else-if="status === 'error'" class="btn primary" @click="checkForUpdate()">{{ t("update.retry") }}</button>
        <template v-else-if="!busy()">
          <button v-if="supported" class="btn subtle" :disabled="!canRecheck" @click="checkForUpdate()"><RefreshCw :size="14" />{{ t("update.recheck") }}</button>
          <button class="btn" @click="close">{{ t("update.close") }}</button>
        </template>
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
/* 更新说明较长（分段、带表情），对话框宽一些，说明区域最多占屏幕高度的 65% */
.dialog {
  width: min(960px, calc(100% - 48px));
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
.checked {
  margin-left: 4px;
}
.head-actions {
  display: flex;
  gap: 2px;
}
.icon-btn:disabled,
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.spinning :deep(svg),
.spinning svg {
  animation: spin 1s linear infinite;
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
h3 {
  margin: 0 0 -4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.skip {
  margin-right: auto;
  color: var(--text-3);
}
.notes {
  max-height: min(640px, 65vh);
  overflow: auto;
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--bg-sunken);
  font-size: 14px;
  line-height: 1.8;
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
</style>
