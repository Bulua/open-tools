<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { isTauri } from "@tauri-apps/api/core";
import { Check, Copy, MapPin, RefreshCw, Search } from "lucide-vue-next";
import CopyList from "@/components/common/CopyList.vue";
import { useClipboard } from "@/composables/useClipboard";
import { SERVICE_NAMES, formatCoordinates, lookupIp, type IpInfo } from "../ipLookup";

const { t } = useI18n();

/** 查询本机公网 IP 及归属地、经纬度；也可以查询任意 IP */
const info = ref<IpInfo | null>(null);
const loading = ref(false);
const error = ref("");
const query = ref("");
/** 当前显示的是不是本机 */
const isSelf = ref(true);
const localIp = ref("");

const run = async (ip = "") => {
  loading.value = true;
  error.value = "";
  try {
    info.value = await lookupIp(ip);
    isSelf.value = !ip;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  run();
  // 局域网 IP 只有桌面版能拿到
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    localIp.value = (await invoke<string | null>("local_ip").catch(() => null)) ?? "";
  }
});

const location = computed(() => {
  const i = info.value;
  return i ? [i.country, i.region, i.city].filter((x, idx, arr) => x && arr.indexOf(x) === idx).join(" · ") : "";
});

const items = computed(() => {
  const i = info.value;
  if (!i) return [];
  return [
    { label: t("network.location"), value: location.value },
    { label: t("network.coordinates"), value: formatCoordinates(i.latitude, i.longitude) },
    { label: t("network.coordinatesRaw"), value: Number.isFinite(i.latitude) ? `${i.latitude}, ${i.longitude}` : "" },
    { label: t("network.isp"), value: i.isp },
    { label: t("network.org"), value: i.org !== i.isp ? i.org : "" },
    { label: "ASN", value: i.asn },
    { label: t("network.timezone"), value: i.timezone ? i.timezone + t("network.paren", { text: `UTC${i.utcOffset}` }) : "" },
    { label: t("network.postal"), value: i.postal },
    { label: t("network.ipType"), value: i.type },
    { label: t("network.source"), value: i.source },
    ...(isSelf.value && localIp.value ? [{ label: t("network.localIp"), value: localIp.value }] : []),
  ].filter((x) => x.value);
});

const { copied, copy } = useClipboard();
</script>

<template>
  <div class="ip">
    <section class="card hero">
      <div class="hero-body">
        <span class="caption">{{ isSelf ? t("network.selfIp") : t("network.queriedIp") }}</span>
        <div class="ip-row">
          <span class="ip-value" :class="{ muted: !info }">{{ info?.ip || (loading ? t("network.querying") : "—") }}</span>
          <button v-if="info" class="icon-btn" :class="{ ok: copied }" :title="t('network.copyIp')" @click="copy(info.ip)">
            <Check v-if="copied" :size="16" />
            <Copy v-else :size="16" />
          </button>
        </div>
        <p v-if="info" class="where"><MapPin :size="14" />{{ location }}</p>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <div class="search">
        <input v-model="query" class="field mono" spellcheck="false" :placeholder="t('network.ipPlaceholder')" @keydown.enter="run(query)" />
        <button class="btn primary" :disabled="loading || !query.trim()" @click="run(query)"><Search :size="14" />{{ t("network.query") }}</button>
        <button class="btn" :disabled="loading" :title="t('network.selfTitle')" @click="query = ''; run()"><RefreshCw :size="14" />{{ t("network.self") }}</button>
      </div>
    </section>

    <section class="card">
      <div class="card-title">{{ t("network.details") }}</div>
      <CopyList v-if="items.length" :items="items" label-width="96px" />
      <p v-else class="empty">{{ loading ? t("network.queryingLong") : t("network.noData") }}</p>
    </section>

    <p class="notice">
      {{ t("network.ipNotice1", { services: SERVICE_NAMES }) }}{{ t("network.ipNotice2") }}
    </p>
  </div>
</template>

<style scoped>
.ip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}
@media (max-width: 1000px) {
  .ip {
    grid-template-columns: 1fr;
  }
}
.hero {
  padding: 20px;
  gap: 18px;
}
.caption {
  font-size: 12px;
  color: var(--text-3);
}
.ip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.ip-value {
  font-family: var(--font-mono);
  font-size: 32px;
  letter-spacing: 0.5px;
  word-break: break-all;
}
.ip-value.muted {
  color: var(--text-3);
}
.where {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-2);
}
.error {
  margin: 8px 0 0;
  font-size: 13px;
}
.search {
  display: flex;
  gap: 8px;
}
.search .field {
  flex: 1;
  height: 34px;
}
.btn {
  flex-shrink: 0;
}
.empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-3);
}
.notice {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
</style>
