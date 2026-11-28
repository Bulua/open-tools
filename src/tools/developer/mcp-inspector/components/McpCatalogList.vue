<script setup lang="ts">
import { ArrowDownUp, ChevronRight, RefreshCw, Search, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { boxOf, glide } from "@/utils/motion";
import type { CatalogTab, McpEntry } from "../catalog";

const props = defineProps<{ tab: CatalogTab; entries: McpEntry[]; selected?: McpEntry; loading: boolean; error?: string }>();
const emit = defineEmits<{ select: [entry: McpEntry]; refresh: [] }>();
const { t, locale } = useI18n();
const filter = ref("");
const searchInput = ref<HTMLInputElement>();
const listItems = ref<HTMLDivElement>();
const descending = ref(false);
const searchLabel = computed(() => t("network.mcp.searchCatalog", { section: t(`network.mcp.${props.tab}`) }));
const groups = computed(() => {
  const query = filter.value.trim().toLocaleLowerCase(locale.value);
  const visible = props.entries.filter(({ title, detail, value }) =>
    [title, detail, value.description].some((text) => text?.toLocaleLowerCase(locale.value).includes(query)),
  );
  if (props.tab !== "resources") return [{ key: "", entries: visible }];
  const collator = new Intl.Collator(locale.value);
  visible.sort((a, b) => (descending.value ? -1 : 1) * collator.compare(a.title, b.title));
  return [
    { key: "resourceUris", entries: visible.filter((item) => item.kind === "resource") },
    { key: "resourceTemplates", entries: visible.filter((item) => item.kind === "template") },
  ];
});

function clearSearch() {
  filter.value = "";
  searchInput.value?.focus();
}

watch(filter, () => {
  const highlight = listItems.value?.querySelector<HTMLElement>(":scope > .glide");
  highlight?.getAnimations?.().forEach((animation) => animation.cancel());
});

function selectEntry(entry: McpEntry, event: MouseEvent) {
  const list = listItems.value;
  const previous = list?.querySelector<HTMLElement>(".entry[aria-current]");
  const next = event.currentTarget as HTMLButtonElement;
  if (list && previous && previous !== next && typeof list.animate === "function") {
    glide(list, boxOf(previous), boxOf(next), "mcp-entry");
  }
  emit("select", entry);
}
</script>

<template>
  <aside class="catalog-list" :aria-label="t(`network.mcp.${tab}`)">
    <header class="list-toolbar">
      <div class="list-actions">
        <div class="search">
          <Search :size="15" aria-hidden="true" />
          <div class="search-field">
            <input ref="searchInput" v-model="filter" class="field line-field" type="search" :placeholder="searchLabel" :aria-label="searchLabel" />
            <button v-if="filter" type="button" class="icon-btn clear-search" :title="t('common.clear')" :aria-label="t('common.clear')" @click="clearSearch">
              <X :size="14" aria-hidden="true" />
            </button>
          </div>
        </div>
        <button type="button" class="icon-btn" :title="t('network.mcp.refreshCatalog')" :aria-label="t('network.mcp.refreshCatalog')"
          :disabled="loading" @click="emit('refresh')"><RefreshCw :size="15" aria-hidden="true" /></button>
        <button v-if="tab === 'resources'" type="button" class="icon-btn" :title="t('network.mcp.sortResources')"
          :aria-label="t('network.mcp.sortResources')" :aria-pressed="descending" @click="descending = !descending">
          <ArrowDownUp :size="15" aria-hidden="true" />
        </button>
      </div>
    </header>
    <p v-if="loading" class="list-status" role="status">{{ t("network.mcp.loadingCatalog") }}</p>
    <p v-if="error" class="list-status error" role="alert">{{ error }}</p>
    <div v-if="!loading" ref="listItems" class="list-items">
      <p v-if="tab !== 'resources' && !groups[0].entries.length && !error" class="list-status">
        {{ t(entries.length ? "network.mcp.noEntriesMatch" : "network.mcp.emptyCatalog") }}
      </p>
      <component :is="group.key ? 'details' : 'div'" v-for="group in groups" :key="group.key" :open="group.key ? true : undefined">
        <summary v-if="group.key"><ChevronRight :size="14" aria-hidden="true" />{{ t(`network.mcp.${group.key}`) }} ({{ group.entries.length }})</summary>
        <ul>
          <li v-for="(entry, index) in group.entries" :key="entry.id">
            <button type="button" class="entry" :aria-current="selected === entry ? 'true' : undefined" @click="selectEntry(entry, $event)">
              <span class="entry-number">{{ index + 1 }}.</span>
              <strong :title="entry.title">{{ entry.title }}</strong>
              <small v-if="entry.detail && entry.detail !== entry.title" :title="entry.detail">{{ entry.detail }}</small>
            </button>
          </li>
        </ul>
      </component>
    </div>
  </aside>
</template>

<style scoped>
.catalog-list {
  display: flex; flex-direction: column; min-width: 0; min-height: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
}
.list-toolbar { flex: none; border-bottom: 1px solid var(--border); }
.list-actions, .search { display: flex; align-items: center; gap: 8px; min-width: 0; }
.search svg { color: var(--text-2); }
.list-actions { padding: 8px 12px; }
.search { flex: 1; }
.search svg { flex: none; }
.search-field { position: relative; flex: 1; min-width: 0; }
.search-field input::-webkit-search-cancel-button { display: none; }
.search-field:has(.clear-search) input { padding-inline-end: 26px; }
.clear-search { position: absolute; inset-inline-end: 0; inset-block-start: 2px; width: 24px; height: 26px; cursor: pointer; }
.list-items { position: relative; flex: 1; overflow: auto; min-height: 0; padding: 6px 8px 8px; }
.list-status { margin: 6px 12px; color: var(--text-2); font-size: 12px; overflow-wrap: anywhere; white-space: pre-wrap; }
.list-status.error { color: var(--danger); }
summary { display: flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 6px; color: var(--text-2); font-size: 12px; cursor: pointer; }
summary::-webkit-details-marker { display: none; }
details[open] > summary svg { transform: rotate(90deg); }
ul { margin: 0; padding: 0; list-style: none; }
.entry {
  display: grid; grid-template-columns: 3ch minmax(0, 1fr); align-items: baseline;
  width: 100%; min-width: 0; gap: 2px 7px; padding: 5px 9px;
  position: relative; z-index: 1;
  text-align: start; border: 0; border-radius: 6px; color: var(--text); background: transparent;
  transition: color var(--dur) var(--ease-out);
}
.entry:hover { background: var(--hover); }
.entry-number { grid-area: 1 / 1; color: var(--text-2); font: 11px/18px var(--font-sans); }
.entry[aria-current] { color: var(--accent); background: var(--accent-soft); }
.list-items.gliding .entry[aria-current] { background: transparent; }
.list-items :deep(.glide-mcp-entry) { border-radius: 6px; background: var(--accent-soft); }
.entry strong, .entry small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry strong { grid-area: 1 / 2; font-size: 13px; font-weight: 500; line-height: 18px; }
.entry small { grid-column: 2; color: var(--text-2); font: 11px var(--font-sans); }
</style>
