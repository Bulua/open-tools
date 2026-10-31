<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { Play, Square, Trash2 } from "lucide-vue-next";
import { useStoredRef } from "@/composables/useStoredRef";
import { isValidHost, parsePingOutput, pingStats, type PingReply } from "../ping";

/**
 * Ping：每秒 ping 一次目标地址，实时显示每次的延迟、统计和延迟图。
 * 浏览器里无法发送 ICMP，由桌面端调用系统自带的 ping 命令完成，只能在桌面版使用。
 */
const supported = isTauri();
const host = useStoredRef("ping.host", "www.baidu.com");
/** 次数，0 表示一直 ping 直到停止 */
const count = useStoredRef("ping.count", 4);
const TIMEOUT = 2000;
const INTERVAL = 1000;

const replies = ref<(PingReply & { seq: number })[]>([]);
const running = ref(false);
const target = ref("");
const listEl = ref<HTMLElement>();

const valid = computed(() => isValidHost(host.value));
const stats = computed(() => pingStats(replies.value));

let stopRequested = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const start = async () => {
  if (!valid.value || running.value) return;
  const { invoke } = await import("@tauri-apps/api/core");
  replies.value = [];
  target.value = host.value.trim();
  running.value = true;
  stopRequested = false;

  for (let seq = 1; !stopRequested && (count.value === 0 || seq <= count.value); seq++) {
    const startedAt = Date.now();
    let reply: PingReply;
    try {
      reply = parsePingOutput(await invoke<string>("ping_once", { host: target.value, timeoutMs: TIMEOUT }));
    } catch (e) {
      reply = { ok: false, error: String(e) };
    }
    replies.value = [...replies.value, { ...reply, seq }].slice(-500);
    await nextTick();
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight });
    // 不到 1 秒就返回时，等满 1 秒再发下一次
    const rest = INTERVAL - (Date.now() - startedAt);
    if (rest > 0 && !stopRequested) await sleep(rest);
  }
  running.value = false;
};

const stop = () => (stopRequested = true);
onBeforeUnmount(stop);

/** 延迟图：最近 60 次，柱子高度按最大延迟缩放 */
const bars = computed(() => {
  const recent = replies.value.slice(-60);
  const max = Math.max(50, ...recent.filter((r) => r.ok).map((r) => r.time!));
  return recent.map((r) => ({ seq: r.seq, ok: r.ok, height: r.ok ? Math.max(4, (r.time! / max) * 100) : 100, title: r.ok ? `#${r.seq} ${r.time} ms` : `#${r.seq} ${r.error}` }));
});

const fmt = (ms?: number) => (ms === undefined ? "—" : `${ms}`);
const COUNTS = [
  { value: 4, label: "4 次" },
  { value: 10, label: "10 次" },
  { value: 0, label: "持续" },
];
</script>

<template>
  <div class="ping">
    <section class="card controls">
      <input
        v-model="host"
        class="field mono host"
        :class="{ invalid: host.trim() && !valid }"
        spellcheck="false"
        placeholder="域名或 IP，例如 www.baidu.com"
        :disabled="running"
        @keydown.enter="start"
      />
      <div class="seg">
        <button v-for="c in COUNTS" :key="c.value" :class="{ on: count === c.value }" :disabled="running" @click="count = c.value">
          {{ c.label }}
        </button>
      </div>
      <button v-if="!running" class="btn primary" :disabled="!supported || !valid" @click="start"><Play :size="14" />开始</button>
      <button v-else class="btn" @click="stop"><Square :size="13" />停止</button>
      <p v-if="!supported" class="notice">Ping 需要调用系统命令，只能在安装后的桌面版中使用。</p>
      <p v-else-if="host.trim() && !valid" class="notice error">地址只能包含字母、数字、点、短横线和冒号</p>
    </section>

    <!-- 统计 -->
    <section class="stats">
      <div class="stat">
        <span class="stat-label">平均延迟</span>
        <span class="stat-value">{{ fmt(stats.avg) }}<small v-if="stats.avg !== undefined">ms</small></span>
      </div>
      <div class="stat">
        <span class="stat-label">最小 / 最大</span>
        <span class="stat-value">{{ fmt(stats.min) }} / {{ fmt(stats.max) }}<small v-if="stats.min !== undefined">ms</small></span>
      </div>
      <div class="stat" :class="{ bad: stats.loss > 0 }">
        <span class="stat-label">丢包率</span>
        <span class="stat-value">{{ stats.sent ? stats.loss : "—" }}<small v-if="stats.sent">%</small></span>
      </div>
      <div class="stat">
        <span class="stat-label">已发送 / 收到</span>
        <span class="stat-value">{{ stats.sent }} / {{ stats.received }}</span>
      </div>
    </section>

    <section class="card result">
      <header class="card-title">
        <span class="grow">{{ target ? `Ping ${target}` : "结果" }}<em v-if="running"> · 进行中</em></span>
        <button v-if="replies.length && !running" class="icon-btn" title="清空" @click="replies = []"><Trash2 :size="14" /></button>
      </header>
      <div v-if="bars.length" class="chart">
        <span v-for="b in bars" :key="b.seq" class="bar" :class="{ fail: !b.ok }" :style="{ height: `${b.height}%` }" :title="b.title" />
      </div>
      <ol v-if="replies.length" ref="listEl" class="log">
        <li v-for="r in replies" :key="r.seq" :class="{ fail: !r.ok }">
          <span class="seq">#{{ r.seq }}</span>
          <template v-if="r.ok">
            <span>来自 {{ r.ip || target }}</span>
            <span class="time">{{ r.under1ms ? "<1" : r.time }} ms</span>
            <span v-if="r.ttl" class="ttl">TTL={{ r.ttl }}</span>
          </template>
          <span v-else>{{ r.error }}</span>
        </li>
      </ol>
      <p v-else class="empty">输入地址后点「开始」，每秒 ping 一次，超时时间 {{ TIMEOUT / 1000 }} 秒</p>
    </section>
  </div>
</template>

<style scoped>
.ping {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.controls {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px;
}
.host {
  flex: 1;
  min-width: 220px;
  height: 36px;
  font-size: 14px;
}
.btn:disabled,
.seg button:disabled {
  opacity: 0.5;
  cursor: default;
}
.notice {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
.notice.error {
  color: var(--danger);
}

/* 统计：四个大数字 */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.stat-label {
  font-size: 12px;
  color: var(--text-3);
}
.stat-value {
  font-family: var(--font-serif);
  font-size: 28px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.stat-value small {
  margin-left: 3px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-3);
}
.stat.bad .stat-value {
  color: var(--danger);
}

.result {
  min-height: 260px;
}
.grow {
  flex: 1;
}
.grow em {
  font-style: normal;
  font-weight: 400;
  color: var(--accent);
}
/* 延迟图 */
.chart {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 90px;
  padding: 12px 16px 6px;
  border-bottom: 1px solid var(--border);
}
.bar {
  flex: 0 0 auto;
  width: 8px;
  border-radius: 2px 2px 0 0;
  background: var(--accent);
  opacity: 0.85;
}
.bar.fail {
  background: repeating-linear-gradient(45deg, var(--danger) 0 3px, transparent 3px 6px);
  opacity: 0.6;
}
.log {
  list-style: none;
  margin: 0;
  padding: 6px 8px;
  max-height: 320px;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 13px;
}
.log li {
  display: flex;
  gap: 14px;
  padding: 4px 8px;
  border-radius: 6px;
}
.log li:hover {
  background: var(--hover);
}
.log li.fail {
  color: var(--danger);
}
.seq {
  min-width: 36px;
  color: var(--text-3);
}
.time {
  min-width: 64px;
  color: var(--accent);
}
.ttl {
  color: var(--text-3);
}
.empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-3);
}
@media (max-width: 900px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
