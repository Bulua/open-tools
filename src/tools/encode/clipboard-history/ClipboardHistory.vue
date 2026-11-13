<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Check, ChevronDown, ClipboardList, Copy, ExternalLink, Search, Settings2, Trash2, X } from "lucide-vue-next";
import AppToast from "@/components/layout/AppToast.vue";
import { useTheme } from "@/composables/useTheme";
import { usePopover } from "@/composables/usePopover";
import { useWindowEvent } from "@/composables/useWindowEvent";
import { showError } from "@/utils/errorToast";
import { activeHistoryLocation, scrollToHistoryHour } from "@/utils/historyNavigation";
import { shortcutFromKeyboard } from "@/utils/shortcutKeys";
import {
  MAX_CLIPBOARD_ITEMS,
  clipboardShortcut,
  clipboardShortcutBusy,
  clipboardShortcutUnavailable,
  copyClipboardEntry,
  groupClipboardHistory,
  listClipboardHistory,
  openClipboardHistory,
  registerClipboardShortcut,
  setClipboardShortcutRecorder,
  updateClipboardHistory,
  type ClipboardEntry,
  type ClipboardUpdate,
} from "./clipboardHistory";

const { popup = false } = defineProps<{ popup?: boolean }>();
const { t, locale } = useI18n();
if (popup) useTheme();

const query = ref("");
let displayedQuery = "";
const entries = ref<ClipboardEntry[]>([]);
const loadState = ref<"loading" | "ready" | "error">("loading");
const ready = computed(() => loadState.value === "ready");
const enabled = ref(false);
const backgroundError = ref<string>();
const busy = ref(false);
const confirmClear = ref(false);
const settingsTrigger = ref<HTMLButtonElement>();
const settingsPanel = ref<HTMLElement>();
const { open: settingsOpen, style: settingsStyle, toggle: toggleSettings, close: closeSettings } = usePopover(
  settingsTrigger,
  settingsPanel,
  { maxHeight: 350, ignoreEscape: () => document.activeElement === shortcutInput.value },
);
const maxItems = ref(0);
const limitDraft = ref<number | string>("");
const validLimit = computed(() => typeof limitDraft.value === "number"
  && Number.isInteger(limitDraft.value) && limitDraft.value >= 1 && limitDraft.value <= MAX_CLIPBOARD_ITEMS);
const shortcutDraft = ref(clipboardShortcut.value);
const shortcutInput = ref<HTMLInputElement>();
const shortcutError = ref(false);
const copied = ref<number>();
const selected = ref<number>();
const collapsedDays = ref(new Set<string>());
const collapsedDirectoryDays = ref(new Set<string>());
const activeLocation = ref("");
const search = ref<HTMLInputElement>();
const cardPane = ref<HTMLElement>();
const HOUR_GAP = 8;
const dayFormat = computed(() => new Intl.DateTimeFormat(locale.value, { year: "numeric", month: "2-digit", day: "2-digit" }));
const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { timeStyle: "short" }));
const hourFormat = computed(() => new Intl.DateTimeFormat(locale.value, { timeStyle: "short", hourCycle: "h23" }));
const groups = computed(() => groupClipboardHistory(entries.value).map((day) => ({
  ...day,
  label: dayFormat.value.format(day.date),
  hours: day.hours.map((hour) => ({ ...hour, label: hourLabel(day.date, hour.hour) })),
})));
const visibleEntries = computed(() => groups.value.flatMap((day) =>
  collapsedDays.value.has(day.id) ? [] : day.hours.flatMap((hour) => hour.entries),
));

let active = true;
let disposed = false;
let revision = 0;
let navigation = 0;
let queryTimer: ReturnType<typeof setTimeout> | undefined;
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
let unlisten: (() => void) | undefined;

async function refresh() {
  const request = ++revision;
  const requestedQuery = query.value;
  try {
    const result = await listClipboardHistory(requestedQuery);
    if (!active || request !== revision || query.value !== requestedQuery) return;
    displayedQuery = requestedQuery;
    entries.value = result.entries;
    enabled.value = result.enabled;
    if (maxItems.value !== result.maxItems) {
      maxItems.value = result.maxItems;
      limitDraft.value = result.maxItems;
    }
    backgroundError.value = result.error ?? undefined;
    loadState.value = "ready";
  } catch (error) {
    if (active && request === revision) {
      loadState.value = "error";
      showError(error);
    }
  }
}

watch(query, () => {
  revision += 1;
  navigation += 1;
  collapsedDays.value.clear();
  collapsedDirectoryDays.value.clear();
  if (cardPane.value) cardPane.value.scrollTop = 0;
  clearTimeout(queryTimer);
  queryTimer = setTimeout(() => {
    if (active) void refresh();
  }, 100);
});

watch(groups, updateActiveLocation, { flush: "post" });
watch(visibleEntries, (items) => {
  if (!items.some((entry) => entry.id === selected.value)) selected.value = items[0]?.id;
});
watch(settingsOpen, async (open) => {
  confirmClear.value = false;
  if (open) {
    shortcutDraft.value = clipboardShortcut.value;
    limitDraft.value = maxItems.value || "";
    shortcutError.value = false;
    await nextTick();
    if (settingsOpen.value) settingsPanel.value?.focus({ preventScroll: true });
  } else {
    setClipboardShortcutRecorder();
    if (active && settingsPanel.value?.contains(document.activeElement)) settingsTrigger.value?.focus();
  }
});

onMounted(async () => {
  if (popup) search.value?.focus();
  try {
    const remove = await getCurrentWebviewWindow().listen("clipboard-history-changed", () => {
      if (active) void refresh();
    });
    if (disposed) remove();
    else unlisten = remove;
  } catch (error) {
    showError(error);
  }
  if (active) void refresh();
});
onActivated(() => {
  if (active) return;
  active = true;
  void refresh();
});
onDeactivated(() => {
  active = false;
  closeSettings();
  copied.value = undefined;
});
onBeforeUnmount(() => {
  disposed = true;
  active = false;
  clearTimeout(queryTimer);
  clearTimeout(copiedTimer);
  if (!popup) setClipboardShortcutRecorder();
  unlisten?.();
});

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  try {
    await action();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

function update(action: ClipboardUpdate) {
  void run(async () => {
    await updateClipboardHistory(action);
    confirmClear.value = false;
    // 后端会通知各窗口，只有事件订阅失败时才主动重查。
    if (!unlisten) await refresh();
  });
}

function toggleRecording(event: Event) {
  const checkbox = event.target as HTMLInputElement;
  const next = checkbox.checked;
  checkbox.checked = enabled.value;
  update({ kind: "recording", enabled: next });
}

function locationId(day: string, hour?: number) {
  return `clipboard-${day}${hour === undefined ? "" : `-hour-${hour}`}`;
}

function hourLabel(date: Date, hour: number) {
  const time = new Date(date);
  time.setHours(hour, 0, 0, 0);
  const start = hourFormat.value.format(time);
  time.setMinutes(59);
  return t("encode.clipboardHourRange", { start, end: hourFormat.value.format(time) });
}

function toggleDirectoryDay(day: string) {
  if (!collapsedDirectoryDays.value.delete(day)) collapsedDirectoryDays.value.add(day);
}

function toggleDay(day: string) {
  navigation += 1;
  if (!collapsedDays.value.delete(day)) collapsedDays.value.add(day);
  void nextTick(updateActiveLocation);
}

async function navigateTo(day: string, hour: number) {
  const request = ++navigation;
  collapsedDays.value.delete(day);
  await nextTick();
  const container = cardPane.value;
  const target = container?.querySelector<HTMLElement>(`#${locationId(day, hour)}`);
  if (!container || !target) return;
  if (!await scrollToHistoryHour(container, target, HOUR_GAP, () => request === navigation && active)) return;
  const first = target.querySelector<HTMLElement>("[data-entry]");
  if (first) selected.value = Number(first.dataset.entry);
  activeLocation.value = target.id;
}

function updateActiveLocation() {
  const container = cardPane.value;
  if (!container) return;
  activeLocation.value = activeHistoryLocation(container, HOUR_GAP);
}

function draftShortcut(shortcut: string) {
  shortcutDraft.value = shortcut;
  shortcutError.value = false;
}

function recordShortcut(event: KeyboardEvent) {
  if (event.code === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.repeat || event.isComposing) return;
  if (event.code === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
    draftShortcut(clipboardShortcut.value);
    shortcutInput.value?.blur();
    return;
  }
  const shortcut = shortcutFromKeyboard(event);
  if (shortcut && (shortcut.includes("+") || /^F\d+$/.test(shortcut))) draftShortcut(shortcut);
}

async function saveShortcut() {
  try {
    await registerClipboardShortcut(shortcutDraft.value);
    shortcutError.value = false;
  } catch {
    shortcutError.value = true;
  }
}

function saveLimit() {
  if (validLimit.value && typeof limitDraft.value === "number") {
    update({ kind: "limit", count: limitDraft.value });
  }
}

function copy(id: number) {
  void run(async () => {
    await copyClipboardEntry(id);
    copied.value = id;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = undefined), 1200);
  });
}

function close() {
  void getCurrentWebviewWindow().close().catch(showError);
}

useWindowEvent("keydown", (event) => {
  if (!event.isComposing && event.key === "Escape") close();
}, () => popup);

function searchKeydown(event: KeyboardEvent) {
  const items = visibleEntries.value;
  if (event.isComposing || query.value !== displayedQuery || !items.length) return;
  const current = items.findIndex((entry) => entry.id === selected.value);
  if (event.key === "Enter") {
    if (current >= 0) copy(items[current].id);
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const step = event.key === "ArrowDown" ? 1 : -1;
  const index = Math.max(0, Math.min(current + step, items.length - 1));
  const entry = items[index];
  selected.value = entry.id;
  void nextTick(() => cardPane.value?.querySelector(`[data-entry="${entry.id}"]`)?.scrollIntoView({ block: "nearest" }));
}
</script>

<template>
  <section class="clipboard" :class="{ popup }">
    <AppToast v-if="popup" />
    <header v-if="popup" class="popup-header" data-tauri-drag-region>
      <ClipboardList :size="18" />
      <strong data-tauri-drag-region>{{ t("encode.clipboardTitle") }}</strong>
      <button type="button" class="icon-btn" :aria-label="t('encode.clipboardClose')" @click="close">
        <X :size="16" />
      </button>
    </header>

    <div class="clipboard-toolbar">
      <label class="clipboard-search">
        <Search :size="16" />
        <input
          ref="search"
          v-model="query"
          type="search"
          :placeholder="t('encode.clipboardSearch')"
          :aria-label="t('encode.clipboardSearch')"
          @keydown="searchKeydown"
        />
      </label>
      <template v-if="!popup">
        <button type="button" class="btn" @click="openClipboardHistory().catch(showError)">
          <ExternalLink :size="14" />{{ t("encode.clipboardOpen") }}
        </button>
        <button
          ref="settingsTrigger"
          type="button"
          class="btn"
          :class="{ 'settings-active': settingsOpen }"
          :aria-expanded="settingsOpen"
          aria-haspopup="dialog"
          @click="toggleSettings"
        >
          <Settings2 :size="15" />{{ t("encode.clipboardSettings") }}
        </button>
      </template>
    </div>

    <Teleport to="body">
      <Transition name="pop">
        <div
          v-if="settingsOpen"
          ref="settingsPanel"
          class="clipboard-settings"
          :style="settingsStyle"
          role="dialog"
          tabindex="-1"
          :aria-label="t('encode.clipboardSettings')"
        >
          <header class="settings-heading">
            <strong>{{ t("encode.clipboardSettings") }}</strong>
            <button type="button" class="icon-btn" :aria-label="t('encode.clipboardCloseSettings')" @click="closeSettings">
              <X :size="16" />
            </button>
          </header>
          <div class="settings-fields">
            <label class="check">
              <input type="checkbox" :checked="enabled" :disabled="!ready || busy" @change="toggleRecording" />
              {{ t("encode.clipboardRecording") }}
            </label>
            <form class="settings-field" @submit.prevent="saveShortcut">
              <label for="clipboard-shortcut">{{ t("encode.clipboardShortcut") }}</label>
              <div class="setting-control">
                <input
                  id="clipboard-shortcut"
                  ref="shortcutInput"
                  class="field shortcut-input"
                  :value="shortcutDraft"
                  :disabled="clipboardShortcutBusy"
                  aria-describedby="clipboard-shortcut-hint"
                  readonly
                  spellcheck="false"
                  @focus="setClipboardShortcutRecorder(draftShortcut)"
                  @blur="setClipboardShortcutRecorder()"
                  @keydown="recordShortcut"
                />
                <button type="submit" class="btn small" :disabled="clipboardShortcutBusy || (shortcutDraft === clipboardShortcut && !clipboardShortcutUnavailable)">
                  {{ t("encode.clipboardSave") }}
                </button>
              </div>
              <span id="clipboard-shortcut-hint" class="caption">{{ t("encode.clipboardShortcutHint") }}</span>
              <span v-if="shortcutError || clipboardShortcutUnavailable" class="warning" role="status">
                {{ t("encode.clipboardShortcutUnavailable") }}
              </span>
            </form>
            <form class="settings-field" @submit.prevent="saveLimit">
              <label for="clipboard-limit">{{ t("encode.clipboardLimit") }}</label>
              <div class="setting-control">
                <input id="clipboard-limit" v-model.number="limitDraft" class="field limit-input" type="number" min="1" :max="MAX_CLIPBOARD_ITEMS" step="1" required :disabled="!ready || busy" />
                <button type="submit" class="btn small" :disabled="!ready || busy || !validLimit || limitDraft === maxItems">
                  {{ t("encode.clipboardSave") }}
                </button>
              </div>
              <span class="caption">{{ t("encode.clipboardLimitRange", { max: MAX_CLIPBOARD_ITEMS }) }}</span>
            </form>
          </div>
          <div class="settings-footer">
            <p class="caption">{{ t("encode.clipboardRetention") }}</p>
            <button type="button" class="btn small subtle clear-button" :disabled="!ready || busy" @click="confirmClear ? update({ kind: 'clear' }) : confirmClear = true">
              <Trash2 :size="14" />{{ t(confirmClear ? "encode.clipboardConfirmClear" : "encode.clipboardClear") }}
            </button>
            <button v-if="confirmClear" type="button" class="btn small subtle" @click="confirmClear = false">
              {{ t("encode.clipboardCancel") }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <p v-if="ready && !enabled" class="notice" role="status">{{ t("encode.clipboardPaused") }}</p>
    <p v-if="backgroundError" class="notice warning" role="status">{{ backgroundError }}</p>

    <div class="history-layout">
      <nav class="history-days" :aria-label="t('encode.clipboardTimeline')">
        <h2>{{ t("encode.clipboardTimeline") }}</h2>
        <div v-for="day in groups" :key="day.id" class="directory-day">
          <button
            type="button"
            class="day-button history-fold-toggle"
            :aria-expanded="!collapsedDirectoryDays.has(day.id)"
            :aria-controls="`${locationId(day.id)}-directory`"
            :aria-current="activeLocation === locationId(day.id) ? 'location' : undefined"
            @click="toggleDirectoryDay(day.id)"
          >
            <ChevronDown :size="13" /><span>{{ day.label }}</span>
          </button>
          <div :id="`${locationId(day.id)}-directory`" class="history-fold" :class="{ 'is-collapsed': collapsedDirectoryDays.has(day.id) }" :inert.attr="collapsedDirectoryDays.has(day.id) ? true : undefined">
            <div class="history-fold-inner">
              <button
                v-for="hour in day.hours"
                :key="hour.hour"
                type="button"
                class="hour-button"
                :aria-current="activeLocation === locationId(day.id, hour.hour) ? 'location' : undefined"
                @click="navigateTo(day.id, hour.hour)"
              >
                <span>{{ hour.label }}</span>
                <small>{{ t("encode.clipboardCount", { count: hour.entries.length }) }}</small>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div ref="cardPane" class="history-content" @scroll.passive="updateActiveLocation">
        <section v-for="day in groups" :id="locationId(day.id)" :key="day.id" class="day-section" data-history-anchor="day">
          <h2 class="day-heading">
            <button
              type="button"
              class="history-day-toggle history-fold-toggle"
              :aria-expanded="!collapsedDays.has(day.id)"
              :aria-controls="`${locationId(day.id)}-content`"
              @click="toggleDay(day.id)"
            >
              <ChevronDown :size="17" />
              <span>{{ day.label }}</span>
              <small>{{ t("encode.clipboardCount", { count: day.count }) }}</small>
            </button>
          </h2>
          <div :id="`${locationId(day.id)}-content`" class="history-fold" :class="{ 'is-collapsed': collapsedDays.has(day.id) }" :inert.attr="collapsedDays.has(day.id) ? true : undefined" @transitionend.self="updateActiveLocation">
            <div class="history-fold-inner">
              <section v-for="hour in day.hours" :id="locationId(day.id, hour.hour)" :key="hour.hour" class="hour-section" data-history-anchor="hour">
                <h3>{{ hour.label }}</h3>
                <TransitionGroup tag="ul" name="cards" class="card-grid">
                  <li v-for="entry in hour.entries" :key="entry.id" class="history-card" :class="{ selected: entry.id === selected }" :data-entry="entry.id">
                    <div class="card-header">
                      <time :datetime="new Date(entry.copiedAt).toISOString()">{{ timeFormat.format(entry.copiedAt) }}</time>
                      <div class="card-actions">
                        <button type="button" class="btn small subtle" :class="{ copied: copied === entry.id }" :disabled="busy" @focus="selected = entry.id" @click="copy(entry.id)">
                          <Check v-if="copied === entry.id" :size="14" />
                          <Copy v-else :size="14" />
                          {{ t(copied === entry.id ? "encode.clipboardCopied" : "encode.clipboardCopy") }}
                        </button>
                        <button type="button" class="icon-btn delete-button" :title="t('encode.clipboardDelete')" :aria-label="t('encode.clipboardDelete')" :disabled="busy" @focus="selected = entry.id" @click="update({ kind: 'delete', id: entry.id })">
                          <Trash2 :size="15" />
                        </button>
                      </div>
                    </div>
                    <p class="card-text">{{ entry.preview }}</p>
                  </li>
                </TransitionGroup>
              </section>
            </div>
          </div>
        </section>
        <div v-if="!groups.length" class="empty" role="status">
          <ClipboardList :size="23" />
          <p>{{ t(loadState === "error" ? "encode.clipboardUnavailable" : !ready ? "encode.clipboardLoading" : query.trim() ? "encode.clipboardNoMatches" : "encode.clipboardEmpty") }}</p>
        </div>
      </div>
    </div>

    <p v-if="popup" class="popup-keys caption">{{ t("encode.clipboardKeys") }}</p>
  </section>
</template>

<style scoped>
.clipboard {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
}

.popup {
  gap: 10px;
  padding: 12px;
  background: var(--bg);
}

.popup-header,
.clipboard-toolbar,
.clipboard-search,
.setting-control,
.settings-footer,
.settings-heading,
.day-button,
.hour-button,
.card-header,
.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.popup-header {
  padding-inline: 4px;
}

.popup-header strong {
  flex: 1;
}

.clipboard-toolbar {
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.clipboard-search {
  flex: 1 1 180px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-2);
}

.clipboard-search:focus-within,
.settings-active {
  border-color: var(--accent);
}

.clipboard-search input {
  flex: 1;
  width: 0;
  height: 36px;
  border: 0;
  outline: none;
  background: none;
  color: var(--text);
}

.clipboard-search input::-webkit-search-cancel-button {
  cursor: pointer;
}

.clipboard-settings {
  position: fixed;
  z-index: 60;
  display: grid;
  gap: 12px;
  width: min(370px, calc(100vw - 16px));
  max-height: min(350px, calc(100vh - 32px));
  padding: 12px 16px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.settings-heading {
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.settings-fields {
  display: grid;
  justify-items: start;
  gap: 10px;
}

.settings-fields > .check {
  padding-top: 4px;
}

.settings-field {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.setting-control .field {
  height: 28px;
  padding: 0 7px;
}

.shortcut-input {
  width: 154px;
  font-variant-numeric: tabular-nums;
}

.limit-input {
  width: 76px;
}

.settings-footer {
  flex-wrap: wrap;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.settings-footer p {
  flex: 1 1 240px;
}

.notice {
  margin: 0;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-sunken);
}

.caption,
.notice,
.warning {
  margin: 0;
  color: var(--text-2);
  font-size: 12px;
}

.warning,
.clear-button,
.delete-button:hover {
  color: var(--danger);
}

.history-layout {
  display: grid;
  grid-template-columns: clamp(126px, 28%, 172px) minmax(0, 1fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.history-days {
  padding-right: 10px;
  overflow: auto;
  border-right: 1px solid var(--border);
}

.history-days h2 {
  margin: 0 0 3px;
  padding: 8px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
}

.directory-day + .directory-day {
  margin-top: 12px;
}

.day-button,
.hour-button {
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  text-align: start;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

.day-button {
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
}

.hour-button {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 2px 4px;
  padding-inline-start: 34px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.hour-button small {
  white-space: nowrap;
  font-size: 11px;
}

.day-button:hover,
.hour-button:hover {
  background: var(--hover);
}

.day-button[aria-current],
.hour-button[aria-current] {
  background: var(--accent-soft);
  color: var(--accent);
}

.history-content {
  overflow: auto;
  padding-inline-end: 5px;
  overflow-anchor: none;
}

.day-section + .day-section {
  margin-top: 24px;
}

.day-heading {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0;
  background: var(--bg);
}

.hour-section {
  padding: 8px 1px 2px;
}

.hour-section + .hour-section {
  margin-top: 8px;
}

.hour-section h3 {
  margin: 0 0 8px;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.popup .card-grid {
  grid-template-columns: minmax(0, 1fr);
}

.history-card {
  min-width: 0;
  padding: 8px 11px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}

.history-card.selected {
  border-color: var(--accent);
}

.history-card.cards-move {
  transition: transform var(--dur) var(--ease-out);
}

.history-layout button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.card-header {
  justify-content: space-between;
  min-width: 0;
  color: var(--text-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.card-actions {
  gap: 2px;
}

.card-actions .btn {
  padding-inline: 6px;
}

.card-actions .copied {
  color: var(--success);
}

.card-actions .copied svg {
  animation: copy-check-in var(--dur-fast) var(--ease-out);
}

@keyframes copy-check-in {
  from { transform: translateY(3px); }
}

.card-text {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  margin: 6px 0 0;
  white-space: pre-wrap;
  color: var(--text);
}

.empty {
  display: grid;
  min-height: 100%;
  place-content: center;
  justify-items: center;
  gap: 6px;
  padding: 12px;
  color: var(--text-2);
  text-align: center;
  font-size: 13px;
}

.empty p {
  margin: 0;
}

.popup-keys {
  text-align: center;
}
</style>
