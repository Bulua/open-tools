<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { Check, Copy, MapPin, RefreshCw, Search } from "lucide-vue-next";
import CopyList from "@/components/common/CopyList.vue";
import { useClipboard } from "@/composables/useClipboard";
import { SERVICE_NAMES, formatCoordinates, lookupIp, type IpInfo } from "../ipLookup";

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
    { label: "位置", value: location.value },
    { label: "经纬度", value: formatCoordinates(i.latitude, i.longitude) },
    { label: "经纬度（数值）", value: Number.isFinite(i.latitude) ? `${i.latitude}, ${i.longitude}` : "" },
    { label: "运营商", value: i.isp },
    { label: "组织", value: i.org !== i.isp ? i.org : "" },
    { label: "ASN", value: i.asn },
    { label: "时区", value: i.timezone ? `${i.timezone}（UTC${i.utcOffset}）` : "" },
    { label: "邮编", value: i.postal },
    { label: "IP 类型", value: i.type },
    { label: "数据来源", value: i.source },
    ...(isSelf.value && localIp.value ? [{ label: "局域网 IP", value: localIp.value }] : []),
  ].filter((x) => x.value);
});

const { copied, copy } = useClipboard();
</script>

<template>
  <div class="ip">
    <section class="card hero">
      <div class="hero-body">
        <span class="caption">{{ isSelf ? "本机公网 IP" : "查询的 IP" }}</span>
        <div class="ip-row">
          <span class="ip-value" :class="{ muted: !info }">{{ info?.ip || (loading ? "查询中…" : "—") }}</span>
          <button v-if="info" class="icon-btn" :class="{ ok: copied }" title="复制 IP" @click="copy(info.ip)">
            <Check v-if="copied" :size="16" />
            <Copy v-else :size="16" />
          </button>
        </div>
        <p v-if="info" class="where"><MapPin :size="14" />{{ location }}</p>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <div class="search">
        <input v-model="query" class="field mono" spellcheck="false" placeholder="查询其他 IP，例如 8.8.8.8" @keydown.enter="run(query)" />
        <button class="btn primary" :disabled="loading || !query.trim()" @click="run(query)"><Search :size="14" />查询</button>
        <button class="btn" :disabled="loading" title="重新查询本机" @click="query = ''; run()"><RefreshCw :size="14" />本机</button>
      </div>
    </section>

    <section class="card">
      <div class="card-title">详细信息</div>
      <CopyList v-if="items.length" :items="items" label-width="96px" />
      <p v-else class="empty">{{ loading ? "正在查询…" : "暂无数据" }}</p>
    </section>

    <p class="notice">
      归属地数据来自免费的公共服务（依次尝试 {{ SERVICE_NAMES }}），查询时会把要查询的 IP 发送给该服务，其中 ip-api.com 不支持加密传输；
      位置根据 IP 估算，精确到城市级别，使用代理或 VPN 时显示的是代理服务器的位置。
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
  color: var(--danger);
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
.btn:disabled {
  opacity: 0.5;
  cursor: default;
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
