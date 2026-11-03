<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, RefreshCw } from "lucide-vue-next";
import { useStoredRef } from "@/composables/useStoredRef";
import { useClipboard } from "@/composables/useClipboard";
import { CHARSETS, DEFAULT_PASSWORD, crackTime, generatePassword, passwordStrength, type PasswordOptions } from "../password";

/**
 * 随机密码生成器：可选字符种类、自定义字符和长度，可以一次生成多个。
 * 使用系统的安全随机数，密码只显示在这里，不保存、不上传。
 */
const { t } = useI18n();
const options = useStoredRef<PasswordOptions>("password.options", { ...DEFAULT_PASSWORD });
// 兼容旧的存储内容：缺少的字段用默认值补上
options.value = { ...DEFAULT_PASSWORD, ...options.value };
const count = useStoredRef("password.count", 5);

const error = ref("");
const password = ref("");
const batch = ref<string[]>([]);

const regenerate = () => {
  try {
    password.value = generatePassword(options.value);
    batch.value = Array.from({ length: count.value }, () => generatePassword(options.value));
    error.value = "";
  } catch (e) {
    password.value = "";
    batch.value = [];
    error.value = e instanceof Error ? e.message : String(e);
  }
};
watch([options, count], regenerate, { deep: true, immediate: true });

const strength = computed(() => passwordStrength(options.value));

/** 按字符种类着色，数字和符号更容易分辨 */
const kindOf = (c: string) => (CHARSETS.digits.includes(c) ? "d" : /[A-Za-z]/.test(c) ? "" : "s");

const TOGGLES = [
  { key: "upper", sample: "A-Z" },
  { key: "lower", sample: "a-z" },
  { key: "digits", sample: "0-9" },
  { key: "symbols", sample: "!@#$" },
] as const;

const PRESETS: { label: string; value: Partial<PasswordOptions> }[] = [
  { label: "presetNormal", value: { length: 16, upper: true, lower: true, digits: true, symbols: true, custom: "" } },
  { label: "presetStrong", value: { length: 32, upper: true, lower: true, digits: true, symbols: true, custom: "" } },
  { label: "presetAlnum", value: { length: 16, upper: true, lower: true, digits: true, symbols: false, custom: "" } },
  { label: "presetPin", value: { length: 6, upper: false, lower: false, digits: true, symbols: false, custom: "" } },
  { label: "presetWifi", value: { length: 12, upper: true, lower: true, digits: true, symbols: false, custom: "", excludeAmbiguous: true } },
];
const applyPreset = (p: Partial<PasswordOptions>) => (options.value = { ...options.value, ...p });

const setLength = (e: Event) => {
  const n = Math.round(Number((e.target as HTMLInputElement).value));
  if (Number.isFinite(n)) options.value.length = Math.min(256, Math.max(1, n));
};

const main = useClipboard();
const all = useClipboard();
const one = useClipboard();
const copiedIndex = ref(-1);
const copyOne = (p: string, i: number) => {
  one.copy(p);
  copiedIndex.value = i;
};
</script>

<template>
  <div class="password">
    <aside class="card panel">
      <section class="section">
        <h3>{{ t("encode.length") }}<b class="value">{{ options.length }}</b></h3>
        <div class="length-row">
          <input v-model.number="options.length" class="range" type="range" min="4" max="64" />
          <input class="field num" type="number" min="1" max="256" :value="options.length" @change="setLength" />
        </div>
      </section>

      <section class="section">
        <h3>{{ t("encode.characters") }}</h3>
        <div class="toggles">
          <label v-for="g in TOGGLES" :key="g.key" class="toggle" :class="{ on: options[g.key] }">
            <input v-model="options[g.key]" type="checkbox" />
            <span>{{ t(`encode.${g.key}`) }}</span>
            <code>{{ g.sample }}</code>
          </label>
        </div>
        <input v-model="options.custom" class="field" spellcheck="false" :placeholder="t('encode.customPlaceholder')" />
        <label class="check"><input v-model="options.excludeAmbiguous" type="checkbox" />{{ t("encode.excludeAmbiguous") }}</label>
        <label class="check"><input v-model="options.requireEach" type="checkbox" />{{ t("encode.requireEach") }}</label>
      </section>

      <section class="section">
        <h3>{{ t("encode.presets") }}</h3>
        <div class="presets">
          <button v-for="p in PRESETS" :key="p.label" @click="applyPreset(p.value)">{{ t(`encode.${p.label}`) }}</button>
        </div>
      </section>
    </aside>

    <div class="main">
      <section class="card hero">
        <p v-if="error" class="error">{{ error }}</p>
        <div v-else class="pw" :class="{ long: password.length > 32 }">
          <span v-for="(c, i) in password" :key="i" :class="kindOf(c)">{{ c }}</span>
        </div>
        <div class="hero-actions">
          <div class="meter" :class="`l${strength.level}`">
            <span class="bars"><i v-for="n in 4" :key="n" :class="{ on: n <= strength.level + 1 }" /></span>
            <b>{{ strength.label }}</b>
            <span class="detail">{{ t("encode.entropy", { bits: strength.bits, time: crackTime(strength.bits) }) }}</span>
          </div>
          <button class="btn" :title="t('encode.regenerateTitle')" @click="regenerate"><RefreshCw :size="14" />{{ t("encode.regenerate") }}</button>
          <button class="btn primary" :disabled="!password" @click="main.copy(password)">
            <Check v-if="main.copied.value" :size="14" /><Copy v-else :size="14" />{{ main.copied.value ? t("encode.copied") : t("encode.copy") }}
          </button>
        </div>
      </section>

      <section class="card list">
        <div class="card-title">
          {{ t("encode.batch") }}
          <div class="seg count">
            <button v-for="n in [5, 10, 20, 50]" :key="n" :class="{ on: count === n }" @click="count = n">{{ t("encode.countN", { n }) }}</button>
          </div>
          <button class="btn small subtle push" :disabled="!batch.length" @click="all.copy(batch.join('\n'))">
            <Check v-if="all.copied.value" :size="13" /><Copy v-else :size="13" />{{ t("encode.copyAll") }}
          </button>
        </div>
        <ol class="items">
          <li v-for="(p, i) in batch" :key="i" @click="copyOne(p, i)">
            <span class="no">{{ i + 1 }}</span>
            <code>{{ p }}</code>
            <span class="hint">{{ one.copied.value && copiedIndex === i ? t("encode.copied") : t("encode.clickToCopy") }}</span>
          </li>
        </ol>
      </section>
      <p class="note">{{ t("encode.secureNote") }}</p>
    </div>
  </div>
</template>

<style scoped>
.password {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.panel {
  flex: 0 0 290px;
}
h3 {
  display: flex;
  align-items: baseline;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.value {
  margin-left: auto;
  font-size: 15px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.length-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.range {
  flex: 1;
  accent-color: var(--accent);
}
.field.num {
  width: 64px;
  height: 30px;
  padding: 0 8px;
  font-size: 13px;
}
.field {
  height: 32px;
  font-size: 13px;
}
.toggles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--text-2);
  cursor: pointer;
}
.toggle input {
  margin: 0;
  accent-color: var(--accent);
}
.toggle code {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}
.toggle.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--text);
}
.check {
  font-size: 12.5px;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.presets button {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: none;
  font-size: 12px;
  color: var(--text-2);
}
.presets button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hero {
  padding: 22px 20px 16px;
  gap: 16px;
}
.pw {
  font-family: var(--font-mono);
  font-size: 30px;
  line-height: 1.35;
  letter-spacing: 1px;
  word-break: break-all;
}
.pw.long {
  font-size: 20px;
}
.pw .d {
  color: var(--syntax-key);
}
.pw .s {
  color: var(--accent);
}
.error {
  font-size: 14px;
}
.hero-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.meter {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.bars {
  display: flex;
  gap: 3px;
}
.bars i {
  width: 22px;
  height: 6px;
  border-radius: 3px;
  background: var(--active);
}
.meter.l0 .bars i.on,
.meter.l0 b {
  background: var(--danger);
  color: var(--danger);
}
.meter.l1 .bars i.on {
  background: var(--warning);
}
.meter.l1 b {
  color: var(--warning);
}
.meter.l2 .bars i.on,
.meter.l3 .bars i.on {
  background: var(--success);
}
.meter.l2 b,
.meter.l3 b {
  color: var(--success);
}
.meter.l0 b {
  background: none;
}
.detail {
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  margin-left: 8px;
}
.push {
  margin-left: auto;
}
.items {
  margin: 0;
  padding: 4px 0;
  list-style: none;
  max-height: 360px;
  overflow: auto;
}
.items li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  cursor: pointer;
}
.items li:hover {
  background: var(--hover);
}
.no {
  flex: 0 0 20px;
  font-size: 12px;
  color: var(--text-3);
  text-align: right;
}
.items code {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 13.5px;
  word-break: break-all;
}
.items .hint {
  font-size: 12px;
  color: var(--text-3);
  opacity: 0;
}
.items li:hover .hint {
  opacity: 1;
}
.note {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
</style>
