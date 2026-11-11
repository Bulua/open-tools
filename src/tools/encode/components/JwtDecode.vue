<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import TextPane from "@/components/common/TextPane.vue";
import { formatDateTime, relativeTime } from "@/utils/time";
import { decodeJwt, jwtStatus, type JwtStatus } from "../jwt";

/** 解码 JWT：显示 Header、Payload 和过期状态（不校验签名） */
const { t } = useI18n();
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

/** 状态的颜色；文字见文案 encode.valid 等 */
const STATUS_TONE: Record<JwtStatus, string> = { valid: "ok", expired: "bad", notYetValid: "warn", noExpiry: "muted" };

/** 常见的时间字段，名称见文案 encode.iat 等 */
const TIME_CLAIMS = ["iat", "nbf", "exp"] as const;

const summary = computed(() => {
  const d = decoded.value;
  if (!d?.ok) return null;
  const times = TIME_CLAIMS.filter((k) => typeof d.payload[k] === "number").map((k) => {
    const ms = (d.payload[k] as number) * 1000;
    return { label: t(`encode.${k}`), value: formatDateTime(new Date(ms)), relative: relativeTime(ms) };
  });
  const status = jwtStatus(d.payload);
  return { alg: String(d.header.alg ?? t("encode.unknown")), status: { label: t(`encode.${status}`), tone: STATUS_TONE[status] }, times };
});

useToolResult(() => decoded.value?.ok ? token.value : "");
</script>

<template>
  <div class="jwt">
    <TextPane v-model="token" class="input" label="JWT" :placeholder="t('encode.jwtPlaceholder')" />

    <div class="output">
      <p v-if="decoded && !decoded.ok" class="message error">{{ decoded.message }}</p>
      <p v-else-if="!decoded" class="message">{{ t("encode.jwtHint") }}</p>

      <template v-else-if="summary">
        <section class="card">
          <header class="card-title">
            {{ t("encode.summary") }}
            <span class="note">{{ t("encode.noSignature") }}</span>
          </header>
          <div class="summary">
            <div class="item status">
              <span class="label">{{ t("encode.status") }}</span>
              <span class="chip" :class="summary.status.tone">{{ summary.status.label }}</span>
            </div>
            <div class="item">
              <span class="label">{{ t("encode.algorithm") }}</span>
              <span>{{ summary.alg }}</span>
            </div>
            <div v-for="time in summary.times" :key="time.label" class="item">
              <span class="label">{{ time.label }}</span>
              <span>{{ time.value }}<em>{{ t("encode.paren", { text: time.relative }) }}</em></span>
            </div>
          </div>
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
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px 24px;
  padding: 14px 16px;
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
  margin-left: auto;
  padding-right: 6px;
  font-weight: 400;
  color: var(--text-3);
}
/* 状态是最重要的信息，标签更醒目 */
.chip {
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
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
