<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { Camera, FolderOpen, ImageOff, Pencil, Pin, RefreshCw, Trash2 } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { showError } from "@/utils/errorToast";
import {
  beginScreenshot,
  deleteScreenshot,
  groupScreenshots,
  listScreenshots,
  pinScreenshot,
  readScreenshot,
  revealScreenshot,
  screenshotShortcut,
  setScreenshotShortcutRecording,
  type ScreenshotItem,
  updateScreenshotShortcut,
} from "../screenshot";
import { shortcutFromKeyboard, shortcutModifiers } from "../screenshotShortcut";

const { t } = useI18n();
const items = ref<ScreenshotItem[]>([]);
const images = ref<Record<string, string>>({});
const loading = ref(false);
const shortcut = ref(screenshotShortcut());
const savedShortcut = ref(shortcut.value);
const shortcutPreview = ref("");
const recording = ref(false);
const savingShortcut = ref(false);
const editingShortcut = ref(false);
const shortcutInput = ref<HTMLInputElement>();
const shortcutState = ref<"idle" | "saved" | "error">("idle");
let unlistenSaved: UnlistenFn | undefined;
let disposed = false;
let refreshVersion = 0;

const groups = computed(() => groupScreenshots(items.value));

async function startEditingShortcut() {
  shortcut.value = savedShortcut.value;
  shortcutPreview.value = "";
  shortcutState.value = "idle";
  editingShortcut.value = true;
  await nextTick();
  shortcutInput.value?.focus();
}
function cancelEditingShortcut() {
  recordingBlur();
  if (savingShortcut.value) return;
  shortcut.value = savedShortcut.value;
  shortcutState.value = "idle";
  editingShortcut.value = false;
}

function recordingFocus() {
  recording.value = true;
  shortcutPreview.value = "";
  setScreenshotShortcutRecording(true, (value) => {
    if (!editingShortcut.value || savingShortcut.value) return;
    shortcut.value = value;
    shortcutPreview.value = "";
    shortcutState.value = "idle";
  });
}
function recordingBlur() {
  recording.value = false;
  shortcutPreview.value = "";
  setScreenshotShortcutRecording(false);
}
function recordShortcut(event: KeyboardEvent) {
  event.stopPropagation();
  // 保留 Tab 的焦点导航，其余按键只录入，不触发输入框默认动作。
  if (event.code === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) return;
  event.preventDefault();
  if (event.repeat || savingShortcut.value || event.isComposing) return;
  const value = shortcutFromKeyboard(event);
  if (value) {
    shortcut.value = value;
    shortcutPreview.value = "";
    shortcutState.value = "idle";
  } else {
    shortcutPreview.value = shortcutModifiers(event).join("+");
  }
}

async function refresh() {
  const version = ++refreshVersion;
  loading.value = true;
  try {
    const latest = await listScreenshots();
    // 焦点恢复与保存事件可能同时触发刷新，只采用最近一次结果。
    if (disposed || version !== refreshVersion) return;
    items.value = latest;
    const current = new Set(items.value.map((item) => item.id));
    images.value = Object.fromEntries(Object.entries(images.value).filter(([id]) => current.has(id)));
    for (const item of items.value) {
      if (images.value[item.id]) continue;
      readScreenshot(item.id)
        .then((base64) => (images.value = { ...images.value, [item.id]: `data:image/png;base64,${base64}` }))
        .catch(() => undefined);
    }
  } catch (error) {
    showError(error);
  } finally {
    if (version === refreshVersion) loading.value = false;
  }
}

async function capture() {
  try {
    await beginScreenshot();
  } catch (error) {
    showError(error);
  }
}

async function saveShortcut() {
  if (savingShortcut.value || !editingShortcut.value) return;
  if (shortcut.value === savedShortcut.value) {
    recordingBlur();
    editingShortcut.value = false;
    return;
  }
  shortcutState.value = "idle";
  savingShortcut.value = true;
  try {
    await updateScreenshotShortcut(shortcut.value.trim());
    savedShortcut.value = shortcut.value;
    recordingBlur();
    editingShortcut.value = false;
    shortcutState.value = "saved";
  } catch (error) {
    shortcutState.value = "error";
    showError(error);
  } finally {
    savingShortcut.value = false;
  }
}

async function remove(item: ScreenshotItem) {
  if (!confirm(t("image.screenshotDeleteConfirm"))) return;
  try {
    await deleteScreenshot(item.id);
    await refresh();
  } catch (error) {
    showError(error);
  }
}

const run = (action: () => Promise<unknown>) => action().catch(showError);

onMounted(async () => {
  window.addEventListener("focus", refresh);
  try {
    const stop = await listen<ScreenshotItem>("screenshot-saved", () => void refresh());
    if (disposed) { stop(); return; }
    unlistenSaved = stop;
  } catch (error) {
    showError(error);
  }
  // 先订阅再加载，避免首次加载期间遗漏新截图。
  if (!disposed) void refresh();
});
onBeforeUnmount(() => {
  recordingBlur();
  disposed = true;
  refreshVersion++;
  unlistenSaved?.();
  window.removeEventListener("focus", refresh);
});
onDeactivated(cancelEditingShortcut);
</script>

<template>
  <div class="screenshot-history">
    <div class="toolbar capture-bar">
      <button class="btn primary" @click="capture"><Camera :size="16" />{{ t("image.screenshotNow") }}</button>
      <label class="shortcut-field">
        <span>{{ t("image.screenshotShortcut") }}</span>
        <input v-if="editingShortcut" ref="shortcutInput" :value="shortcutPreview || shortcut" class="field mono" :class="{ recording }" :title="t('image.screenshotShortcutRecordHint')" :aria-label="t('image.screenshotShortcutRecordHint')" :disabled="savingShortcut" readonly spellcheck="false" @focus="recordingFocus" @blur="recordingBlur" @keydown="recordShortcut" @keyup.stop="shortcutPreview = ''" />
        <span v-else class="shortcut-value">{{ savedShortcut }}</span>
      </label>
      <button v-if="!editingShortcut" class="btn" @click="startEditingShortcut"><Pencil :size="14" />{{ t("image.screenshotShortcutEdit") }}</button>
      <template v-else>
        <button class="btn" :disabled="savingShortcut" @click="saveShortcut">{{ t("image.screenshotShortcutSave") }}</button>
        <button class="btn subtle" :disabled="savingShortcut" @click="cancelEditingShortcut">{{ t("image.screenshotShortcutCancel") }}</button>
      </template>
      <small v-if="recording" class="recording-hint">{{ t("image.screenshotShortcutRecordHint") }}</small>
      <small v-if="shortcutState === 'saved'" class="saved">{{ t("image.screenshotShortcutSaved") }}</small>
      <span class="spacer" />
      <button class="btn subtle" :disabled="loading" @click="refresh"><RefreshCw :size="15" />{{ t("image.screenshotRefresh") }}</button>
    </div>

    <div v-if="!loading && !items.length" class="empty-history">
      <ImageOff :size="36" :stroke-width="1.4" />
      <strong>{{ t("image.screenshotEmpty") }}</strong>
      <span>{{ t("image.screenshotEmptyHint") }}</span>
    </div>

    <div v-else class="history-scroll">
      <section v-for="day in groups" :key="day.day" class="day-group">
        <h2>{{ day.day }}</h2>
        <div v-for="hour in day.hours" :key="hour.hour" class="hour-group">
          <h3>{{ t("image.screenshotHour", { hour: hour.hour }) }}</h3>
          <div class="shot-grid">
            <article v-for="item in hour.shots" :key="item.id" class="shot-card">
              <div class="thumb">
                <img v-if="images[item.id]" :src="images[item.id]" :alt="item.name" />
                <span v-else>{{ t("image.processing") }}</span>
              </div>
              <footer>
                <time>{{ item.createdAt.slice(11, 19) }}</time>
                <span class="shot-actions">
                  <button :title="t('image.screenshotPin')" @click="run(() => pinScreenshot(item.id))"><Pin :size="15" /></button>
                  <button :title="t('image.screenshotReveal')" @click="run(() => revealScreenshot(item.id))"><FolderOpen :size="15" /></button>
                  <button :title="t('image.remove')" class="danger" @click="remove(item)"><Trash2 :size="15" /></button>
                </span>
              </footer>
            </article>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.screenshot-history { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
.capture-bar { flex-shrink: 0; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.shortcut-field { display: flex; align-items: center; gap: 8px; color: var(--text-2); font-size: 13px; }
.shortcut-value { font-family: var(--font-mono); color: var(--text); }
.shortcut-field .field { width: 190px; height: 32px; cursor: pointer; }
.shortcut-field .field.recording { border-color: var(--accent); background: var(--accent-soft); }
.recording-hint { color: var(--text-2); }
.saved { color: var(--success); }
.history-scroll { min-height: 0; overflow: auto; padding-right: 5px; }
.day-group + .day-group { margin-top: 24px; }
h2 { position: sticky; top: 0; z-index: 2; margin: 0 0 10px; padding: 7px 0; background: var(--bg); color: var(--text); font-size: 18px; }
.hour-group { margin-bottom: 18px; }
h3 { margin: 0 0 8px; color: var(--text-2); font-size: 13px; font-weight: 600; }
.shot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
.shot-card { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-sm); }
.thumb { height: 132px; display: grid; place-items: center; overflow: hidden; background: var(--bg-sunken); color: var(--text-3); font-size: 12px; }
.thumb img { width: 100%; height: 100%; object-fit: contain; }
.shot-card footer { height: 36px; padding: 0 6px 0 10px; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); }
time { color: var(--text-2); font-family: var(--font-mono); font-size: 12px; }
.shot-actions { display: flex; }
.shot-actions button { width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 6px; background: transparent; color: var(--text-3); }
.shot-actions button:hover { background: var(--hover); color: var(--text); }
.shot-actions button.danger:hover { color: var(--danger); background: var(--danger-soft); }
.empty-history { flex: 1; display: grid; place-content: center; justify-items: center; gap: 7px; color: var(--text-3); }
.empty-history strong { color: var(--text-2); font-size: 15px; }
.empty-history span { font-size: 13px; }
</style>
