<script setup lang="ts">
import { computed, ref } from "vue";
import TextPane from "@/components/common/TextPane.vue";
import { formatDateTime, relativeTime } from "@/utils/time";
import { decodeJwt, jwtStatus, type JwtStatus } from "../jwt";

/** 解码 JWT：显示 Header、Payload 和过期状态（不校验签名） */
const token = ref("");

const decoded = computed(() => {
  if (!token.value.trim()) return null;
  try {
    return { ok: true as const, ...decodeJwt(token.value) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
});

const json = (v: unknown) => JSON.stringify(v, null, 2);

const STATUS: Record<JwtStatus, { label: string; tone: string }> = {
  valid: { label: "有效", tone: "ok" },
  expired: { label: "已过期", tone: "bad" },
  notYetValid: { label: "尚未生效", tone: "warn" },
  noExpiry: { label: "未设置过期时间", tone: "muted" },
};

/** 常见的时间字段 */
const TIME_CLAIMS: [string, string][] = [
  ["iat", "签发时间"],
  ["nbf", "生效时间"],
  ["exp", "过期时间"],
];

const summary = computed(() => {
  const d = decoded.value;
  if (!d?.ok) return null;
  const times = TIME_CLAIMS.filter(([k]) => typeof d.payload[k] === "number").map(([k, label]) => {
    const ms = (d.payload[k] as number) * 1000;
    return { label, value: formatDateTime(new Date(ms)), relative: relativeTime(ms) };
  });
  return { alg: String(d.header.alg ?? "未知"), status: STATUS[jwtStatus(d.payload)], times };
});
</script>

<template>
  <div class="jwt">
    <TextPane v-model="token" class="input" label="JWT" placeholder="粘贴 JWT，可以带 Bearer 前缀" />

    <div class="output">
      <p v-if="decoded && !decoded.ok" class="message error">{{ decoded.message }}</p>
      <p v-else-if="!decoded" class="message">在左侧粘贴 JWT 后，这里会显示解码内容和过期状态。</p>

      <template v-else-if="summary">
        <section class="summary">
          <div class="item">
            <span class="label">状态</span>
            <span class="chip" :class="summary.status.tone">{{ summary.status.label }}</span>
          </div>
          <div class="item">
            <span class="label">算法</span>
            <span>{{ summary.alg }}</span>
          </div>
          <div v-for="t in summary.times" :key="t.label" class="item">
            <span class="label">{{ t.label }}</span>
            <span>{{ t.value }}<em>（{{ t.relative }}）</em></span>
          </div>
          <p class="note">仅解码内容，不校验签名是否正确。</p>
        </section>

        <TextPane :model-value="json(decoded.header)" class="header" label="Header" readonly language="json" />
        <TextPane :model-value="json(decoded.payload)" class="payload" label="Payload" readonly language="json" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.jwt {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}
.input {
  flex: 0 0 420px;
}
.output {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
@media (max-width: 1100px) {
  .jwt {
    flex-direction: column;
  }
  .input {
    flex: 0 0 160px;
  }
}

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px 24px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  font-size: 13px;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.label {
  flex: 0 0 56px;
  font-size: 12px;
  color: var(--text-3);
}
em {
  font-style: normal;
  color: var(--text-3);
}
.note {
  grid-column: 1 / -1;
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
.chip {
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 12px;
}
.chip.ok {
  color: var(--success);
  background: var(--success-soft);
}
.chip.bad {
  color: var(--danger);
  background: var(--danger-soft);
}
.chip.warn {
  color: var(--warning);
  background: var(--warning-soft);
}
.chip.muted {
  color: var(--text-2);
  background: var(--active);
}
.header {
  flex: 0 0 auto;
  min-height: 110px;
  max-height: 140px;
}
.payload {
  flex: 1;
}
.message {
  margin: 0;
  padding: 12px 4px;
  font-size: 13px;
  color: var(--text-3);
}
.message.error {
  color: var(--danger);
}
</style>
