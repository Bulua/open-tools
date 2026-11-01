<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, Copy, RefreshCw } from "lucide-vue-next";
import { useStoredRef } from "@/composables/useStoredRef";
import { useClipboard } from "@/composables/useClipboard";
import { CHARSETS, DEFAULT_PASSWORD, crackTime, generatePassword, passwordStrength, type PasswordOptions } from "../password";

/**
 * 随机密码生成器：可选字符种类、自定义字符和长度，可以一次生成多个。
 * 使用系统的安全随机数，密码只显示在这里，不保存、不上传。
 */
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
  { key: "upper", label: "大写字母", sample: "A-Z" },
  { key: "lower", label: "小写字母", sample: "a-z" },
  { key: "digits", label: "数字", sample: "0-9" },
  { key: "symbols", label: "符号", sample: "!@#$" },
] as const;

const PRESETS: { label: string; value: Partial<PasswordOptions> }[] = [
  { label: "常规", value: { length: 16, upper: true, lower: true, digits: true, symbols: true, custom: "" } },
  { label: "高强度", value: { length: 32, upper: true, lower: true, digits: true, symbols: true, custom: "" } },
  { label: "字母数字", value: { length: 16, upper: true, lower: true, digits: true, symbols: false, custom: "" } },
  { label: "6 位 PIN", value: { length: 6, upper: false, lower: false, digits: true, symbols: false, custom: "" } },
  { label: "WiFi 密码", value: { length: 12, upper: true, lower: true, digits: true, symbols: false, custom: "", excludeAmbiguous: true } },
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
        <h3>长度<b class="value">{{ options.length }}</b></h3>
        <div class="length-row">
          <input v-model.number="options.length" class="range" type="range" min="4" max="64" />
          <input class="field num" type="number" min="1" max="256" :value="options.length" @change="setLength" />
        </div>
      </section>

      <section class="section">
        <h3>字符</h3>
        <div class="toggles">
          <label v-for="t in TOGGLES" :key="t.key" class="toggle" :class="{ on: options[t.key] }">
            <input v-model="options[t.key]" type="checkbox" />
            <span>{{ t.label }}</span>
            <code>{{ t.sample }}</code>
          </label>
        </div>
        <input v-model="options.custom" class="field" spellcheck="false" placeholder="自定义字符，例如 _-.@" />
        <label class="check"><input v-model="options.excludeAmbiguous" type="checkbox" />排除易混淆字符（0 O o 1 l I）</label>
        <label class="check"><input v-model="options.requireEach" type="checkbox" />每种字符至少出现一次</label>
      </section>

      <section class="section">
        <h3>快速设置</h3>
        <div class="presets">
          <button v-for="p in PRESETS" :key="p.label" @click="applyPreset(p.value)">{{ p.label }}</button>
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
            <span class="detail">{{ strength.bits }} 位熵 · 暴力破解{{ crackTime(strength.bits) }}</span>
          </div>
          <button class="btn" title="重新生成" @click="regenerate"><RefreshCw :size="14" />换一个</button>
          <button class="btn primary" :disabled="!password" @click="main.copy(password)">
            <Check v-if="main.copied.value" :size="14" /><Copy v-else :size="14" />{{ main.copied.value ? "已复制" : "复制" }}
          </button>
        </div>
      </section>

      <section class="card list">
        <div class="card-title">
          批量生成
          <div class="seg count">
            <button v-for="n in [5, 10, 20, 50]" :key="n" :class="{ on: count === n }" @click="count = n">{{ n }} 个</button>
          </div>
          <button class="btn small subtle push" :disabled="!batch.length" @click="all.copy(batch.join('\n'))">
            <Check v-if="all.copied.value" :size="13" /><Copy v-else :size="13" />复制全部
          </button>
        </div>
        <ol class="items">
          <li v-for="(p, i) in batch" :key="i" @click="copyOne(p, i)">
            <span class="no">{{ i + 1 }}</span>
            <code>{{ p }}</code>
            <span class="hint">{{ one.copied.value && copiedIndex === i ? "已复制" : "点击复制" }}</span>
          </li>
        </ol>
      </section>
      <p class="note">使用系统安全随机数生成，密码只在本机显示，不会保存或上传。</p>
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
.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
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
  margin: 0;
  color: var(--danger);
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
.btn:disabled {
  opacity: 0.5;
}
.btn.small {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
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
