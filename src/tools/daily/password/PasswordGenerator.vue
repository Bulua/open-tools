<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, RefreshCw } from "lucide-vue-next";
import { useStoredRef } from "@/composables/useStoredRef";
import { useClipboard } from "@/composables/useClipboard";
import { showError } from "@/utils/errorToast";
import { writePrivateClipboardText } from "../shared/privateClipboard";
import {
  CHARSETS,
  DEFAULT_PASSWORD,
  charGroups,
  generateBase64Key,
  generateHexKey,
  generatePassword,
  generateUuid,
  type PasswordOptions,
} from "../shared/password";
import { crackTime, passwordStrength, strengthFromBits } from "./password";

type PwMode = "chars" | "hex" | "base64" | "uuid";

/**
 * 随机密码 / 密钥生成器：支持随机字符、Hex 密钥、Base64 密钥与 UUID v4。
 * 使用系统安全随机数，密码只在本机显示，不保存、不上传。
 */
const { t } = useI18n();
const pwMode = useStoredRef<PwMode>("password.mode", "chars");
const options = useStoredRef<PasswordOptions>("password.options", { ...DEFAULT_PASSWORD });
options.value = { ...DEFAULT_PASSWORD, ...options.value };
const hexLength = useStoredRef("password.hexLength", 32);
const hexUpper = useStoredRef("password.hexUpper", false);
const base64Bytes = useStoredRef("password.base64Bytes", 32);
const base64UrlSafe = useStoredRef("password.base64UrlSafe", false);
const uuidUpper = useStoredRef("password.uuidUpper", false);
const uuidCompact = useStoredRef("password.uuidCompact", false);
const count = useStoredRef("password.count", 10);

const error = ref("");
const password = ref("");
const batch = ref<string[]>([]);

const generateOne = (): string => {
  switch (pwMode.value) {
    case "hex":
      return generateHexKey(hexLength.value, hexUpper.value);
    case "base64":
      return generateBase64Key(base64Bytes.value, base64UrlSafe.value);
    case "uuid":
      return generateUuid(uuidUpper.value, uuidCompact.value);
    default:
      return generatePassword(options.value);
  }
};

const regenerate = () => {
  try {
    password.value = generateOne();
    batch.value = Array.from({ length: count.value }, generateOne);
    error.value = "";
  } catch (e) {
    password.value = "";
    batch.value = [];
    error.value = e instanceof Error ? e.message : String(e);
  }
};

watch(
  [pwMode, options, hexLength, hexUpper, base64Bytes, base64UrlSafe, uuidUpper, uuidCompact, count],
  regenerate,
  { deep: true, immediate: true },
);

const charsetCount = computed(() => charGroups(options.value).join("").length);

const strength = computed(() => {
  switch (pwMode.value) {
    case "hex":
      return strengthFromBits(hexLength.value * 4);
    case "base64":
      return strengthFromBits(base64Bytes.value * 8);
    case "uuid":
      return strengthFromBits(122);
    default:
      return passwordStrength(options.value);
  }
});

const metaBadge = computed(() => {
  if (pwMode.value === "chars") return t("encode.charsetSize", { n: charsetCount.value });
  const bits = pwMode.value === "hex" ? hexLength.value * 4 : pwMode.value === "base64" ? base64Bytes.value * 8 : 122;
  return t("encode.bitsUnit", { n: bits });
});

/** 按字符种类着色，数字和符号更容易分辨 */
const kindOf = (c: string) => {
  if (CHARSETS.digits.includes(c)) return "d";
  if (/[A-Za-z]/.test(c)) return "";
  return "s";
};

const MODES: { id: PwMode; key: string }[] = [
  { id: "chars", key: "encode.pwModeChars" },
  { id: "hex", key: "encode.pwModeHex" },
  { id: "base64", key: "encode.pwModeBase64" },
  { id: "uuid", key: "encode.pwModeUuid" },
];

const TOGGLES = [
  { key: "upper", sample: "A-Z" },
  { key: "lower", sample: "a-z" },
  { key: "digits", sample: "0-9" },
  { key: "symbols", sample: "!@#$" },
] as const;

const PRESETS: { label: string; value: Partial<PasswordOptions> }[] = [
  { label: "presetNormal", value: { length: 16, upper: true, lower: true, digits: true, symbols: true, custom: "", exclude: "", groupSize: 0, excludeAmbiguous: false, requireEach: true } },
  { label: "presetStrong", value: { length: 32, upper: true, lower: true, digits: true, symbols: true, custom: "", exclude: "", groupSize: 0, excludeAmbiguous: false, requireEach: true } },
  { label: "presetAlnum", value: { length: 16, upper: true, lower: true, digits: true, symbols: false, custom: "", exclude: "", groupSize: 0, excludeAmbiguous: false, requireEach: true } },
  { label: "presetPin", value: { length: 6, upper: false, lower: false, digits: true, symbols: false, custom: "", exclude: "", groupSize: 0, excludeAmbiguous: false, requireEach: true } },
  { label: "presetWifi", value: { length: 12, upper: true, lower: true, digits: true, symbols: false, custom: "", exclude: "", groupSize: 0, excludeAmbiguous: true, requireEach: true } },
  { label: "presetRecovery", value: { length: 24, upper: true, lower: false, digits: true, symbols: false, custom: "", exclude: "", groupSize: 4, excludeAmbiguous: true, requireEach: true } },
];
const applyPreset = (p: Partial<PasswordOptions>) => (options.value = { ...options.value, ...p });

const clampNum = (e: Event, min: number, max: number, apply: (v: number) => void) => {
  const n = Math.round(Number((e.target as HTMLInputElement).value));
  if (Number.isFinite(n)) apply(Math.min(max, Math.max(min, n)));
};

const gridClass = computed(() => {
  const len = password.value.length;
  if (len <= 24) return "cols-dense";
  if (len <= 44) return "cols-medium";
  return "cols-wide";
});

const main = useClipboard(writePrivateClipboardText);
const all = useClipboard(writePrivateClipboardText);
const one = useClipboard(writePrivateClipboardText);
const copiedIndex = ref(-1);
const copyOne = (p: string, i: number) => {
  void one.copy(p).catch(showError);
  copiedIndex.value = i;
};

useToolResult(() => (!error.value ? password.value : ""));
</script>

<template>
  <div class="password">
    <aside class="card panel">
      <section class="section">
        <h3>{{ t("encode.pwMode") }}</h3>
        <div class="mode-grid">
          <button
            v-for="m in MODES"
            :key="m.id"
            type="button"
            class="mode-pill"
            :class="{ on: pwMode === m.id }"
            @click="pwMode = m.id"
          >
            {{ t(m.key) }}
          </button>
        </div>
      </section>

      <Transition name="panel-swap" mode="out-in">
        <div :key="pwMode" class="panel-body">
          <template v-if="pwMode === 'chars'">
            <section class="section">
              <h3>{{ t("encode.length") }}<b class="value">{{ options.length }}</b></h3>
              <div class="length-row">
                <input v-model.number="options.length" class="range" type="range" min="4" max="64" />
                <input
                  class="field num"
                  type="number"
                  min="1"
                  max="256"
                  :value="options.length"
                  @change="clampNum($event, 1, 256, (v) => (options.length = v))"
                />
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
              <input v-model="options.exclude" class="field" spellcheck="false" :placeholder="t('encode.excludePlaceholder')" />

              <div class="switch-row">
                <span>{{ t("encode.excludeAmbiguous") }}</span>
                <button
                  type="button"
                  class="control-switch"
                  role="switch"
                  :aria-checked="options.excludeAmbiguous"
                  :aria-label="t('encode.excludeAmbiguous')"
                  @click="options.excludeAmbiguous = !options.excludeAmbiguous"
                >
                  <span />
                </button>
              </div>
              <div class="switch-row">
                <span>{{ t("encode.requireEach") }}</span>
                <button
                  type="button"
                  class="control-switch"
                  role="switch"
                  :aria-checked="options.requireEach"
                  :aria-label="t('encode.requireEach')"
                  @click="options.requireEach = !options.requireEach"
                >
                  <span />
                </button>
              </div>
              <div class="switch-row">
                <span>{{ t("encode.groupDash") }}</span>
                <button
                  type="button"
                  class="control-switch"
                  role="switch"
                  :aria-checked="(options.groupSize ?? 0) > 0"
                  :aria-label="t('encode.groupDash')"
                  @click="options.groupSize = options.groupSize ? 0 : 4"
                >
                  <span />
                </button>
              </div>
            </section>

            <section class="section">
              <h3>{{ t("encode.presets") }}</h3>
              <div class="presets">
                <button v-for="p in PRESETS" :key="p.label" type="button" @click="applyPreset(p.value)">{{ t(`encode.${p.label}`) }}</button>
              </div>
            </section>
          </template>

          <template v-else-if="pwMode === 'hex'">
            <section class="section">
              <h3>{{ t("encode.hexLength") }}<b class="value">{{ hexLength }}</b></h3>
              <div class="length-row">
                <input v-model.number="hexLength" class="range" type="range" min="8" max="256" step="2" />
                <input
                  class="field num"
                  type="number"
                  min="2"
                  max="512"
                  :value="hexLength"
                  @change="clampNum($event, 2, 512, (v) => (hexLength = v))"
                />
              </div>
              <div class="presets">
                <button v-for="n in [16, 32, 64, 128]" :key="n" type="button" :class="{ on: hexLength === n }" @click="hexLength = n">
                  {{ n }}
                </button>
              </div>
            </section>
            <section class="section">
              <div class="switch-row">
                <span>{{ t("encode.hexUppercase") }}</span>
                <button
                  type="button"
                  class="control-switch"
                  role="switch"
                  :aria-checked="hexUpper"
                  :aria-label="t('encode.hexUppercase')"
                  @click="hexUpper = !hexUpper"
                >
                  <span />
                </button>
              </div>
            </section>
          </template>

          <template v-else-if="pwMode === 'base64'">
            <section class="section">
              <h3>{{ t("encode.base64Bytes") }}<b class="value">{{ t("encode.base64BytesUnit", { n: base64Bytes }) }}</b></h3>
              <div class="length-row">
                <input v-model.number="base64Bytes" class="range" type="range" min="8" max="128" step="4" />
                <input
                  class="field num"
                  type="number"
                  min="4"
                  max="256"
                  :value="base64Bytes"
                  @change="clampNum($event, 4, 256, (v) => (base64Bytes = v))"
                />
              </div>
              <div class="presets">
                <button v-for="n in [16, 24, 32, 48, 64]" :key="n" type="button" :class="{ on: base64Bytes === n }" @click="base64Bytes = n">
                  {{ t("encode.base64BytesUnit", { n }) }}
                </button>
              </div>
            </section>
            <section class="section">
              <div class="switch-row">
                <span>{{ t("encode.base64UrlSafe") }}</span>
                <button
                  type="button"
                  class="control-switch"
                  role="switch"
                  :aria-checked="base64UrlSafe"
                  :aria-label="t('encode.base64UrlSafe')"
                  @click="base64UrlSafe = !base64UrlSafe"
                >
                  <span />
                </button>
              </div>
            </section>
          </template>

          <template v-else>
            <section class="section">
              <div class="switch-row">
                <span>{{ t("encode.uuidUppercase") }}</span>
                <button
                  type="button"
                  class="control-switch"
                  role="switch"
                  :aria-checked="uuidUpper"
                  :aria-label="t('encode.uuidUppercase')"
                  @click="uuidUpper = !uuidUpper"
                >
                  <span />
                </button>
              </div>
              <div class="switch-row">
                <span>{{ t("encode.uuidCompact") }}</span>
                <button
                  type="button"
                  class="control-switch"
                  role="switch"
                  :aria-checked="uuidCompact"
                  :aria-label="t('encode.uuidCompact')"
                  @click="uuidCompact = !uuidCompact"
                >
                  <span />
                </button>
              </div>
            </section>
          </template>
        </div>
      </Transition>
    </aside>

    <main class="main">
      <section class="card hero">
        <div class="pw-top">
          <div class="pw-showcase">
            <p v-if="error" class="error">{{ error }}</p>
            <div v-else class="pw" :class="{ long: password.length > 36 }">
              <span v-for="(c, i) in password" :key="i" :class="kindOf(c)">{{ c }}</span>
            </div>
          </div>
          <div class="pw-btns">
            <button type="button" class="btn" :title="t('encode.regenerateTitle')" @click="regenerate">
              <RefreshCw :size="14" />{{ t("encode.regenerate") }}
            </button>
            <button type="button" class="btn primary" :disabled="!password" @click="main.copy(password).catch(showError)">
              <Check v-if="main.copied.value" :size="14" />
              <Copy v-else :size="14" />
              {{ main.copied.value ? t("encode.copied") : t("encode.copy") }}
            </button>
          </div>
        </div>

        <div class="hero-meta">
          <div class="meter" :class="`l${strength.level}`">
            <span class="bars"><i v-for="n in 4" :key="n" :class="{ on: n <= strength.level + 1 }" /></span>
            <b>{{ strength.label }}</b>
            <span class="detail">{{ t("encode.entropy", { bits: strength.bits, time: crackTime(strength.bits) }) }}</span>
          </div>
          <span class="meta-badge">{{ metaBadge }}</span>
        </div>
      </section>

      <section class="card list">
        <header class="card-title">
          <span>{{ t("encode.batch") }}</span>
          <div class="seg count">
            <button v-for="n in [5, 10, 20, 50]" :key="n" type="button" :class="{ on: count === n }" @click="count = n">
              {{ t("encode.countN", { n }) }}
            </button>
          </div>
          <div class="title-actions">
            <button type="button" class="icon-btn" :title="t('encode.regenerateTitle')" @click="regenerate">
              <RefreshCw :size="14" />
            </button>
            <button type="button" class="btn small subtle" :disabled="!batch.length" @click="all.copy(batch.join('\n')).catch(showError)">
              <Check v-if="all.copied.value" :size="13" />
              <Copy v-else :size="13" />
              {{ t("encode.copyAll") }}
            </button>
          </div>
        </header>

        <ol class="items" :class="gridClass">
          <li
            v-for="(p, i) in batch"
            :key="i"
            class="item-tile"
            :class="{ copied: one.copied.value && copiedIndex === i }"
            @click="copyOne(p, i)"
          >
            <span class="no">{{ i + 1 }}</span>
            <code :title="p">{{ p }}</code>
            <span class="copy-mark">
              <Check v-if="one.copied.value && copiedIndex === i" :size="13" />
              <Copy v-else :size="13" />
            </span>
          </li>
        </ol>
      </section>

      <p class="note">{{ t("encode.secureNote") }}</p>
    </main>
  </div>
</template>

<style scoped>
.password {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 300px;
  min-height: 0;
  overflow-y: auto;
  box-shadow: var(--shadow-sm);
}
.panel-body {
  display: flex;
  flex-direction: column;
}
.panel-body .section {
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
  font-size: 14px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.mode-pill {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.mode-pill:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.mode-pill.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
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
  width: 66px;
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
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.toggle input {
  margin: 0;
  accent-color: var(--accent);
}
.toggle code {
  margin-left: auto;
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--text-3);
}
.toggle.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--text);
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
  font-size: 12.5px;
  color: var(--text);
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
  border-radius: 999px;
  background: var(--bg-sunken);
  font-size: 12px;
  color: var(--text-2);
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.presets button:hover,
.presets button.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

/* ---------- 右侧主工作区 ---------- */
.main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hero {
  flex-shrink: 0;
  padding: 14px 16px;
  gap: 12px;
  box-shadow: var(--shadow-sm);
}
.pw-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pw-showcase {
  flex: 1;
  min-width: 0;
  min-height: 54px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-sunken);
}
.pw {
  font-family: var(--font-mono);
  font-size: 22px;
  line-height: 1.4;
  letter-spacing: 0.4px;
  word-break: break-all;
  user-select: text;
}
.pw.long {
  font-size: 16px;
}
.pw .d {
  color: var(--syntax-key);
}
.pw .s {
  color: var(--accent);
}
.pw-btns {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.error {
  font-size: 13px;
}
.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
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
  transition: background var(--dur-fast) var(--ease-out);
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
.meta-badge {
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--active);
  color: var(--text-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.list {
  flex: 1;
  min-height: 0;
  box-shadow: var(--shadow-sm);
}
.count {
  margin-left: 4px;
}
.title-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
.items {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 12px;
  list-style: none;
  display: grid;
  gap: 8px;
  align-content: start;
  overflow-y: auto;
}
.items.cols-dense {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
}
.items.cols-medium {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
}
.items.cols-wide {
  grid-template-columns: minmax(0, 1fr);
}
.item-tile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-sunken);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.item-tile:hover {
  border-color: var(--border-strong);
  background: var(--surface);
}
.item-tile.copied {
  border-color: color-mix(in srgb, var(--success) 42%, transparent);
  background: var(--success-soft);
}
.no {
  flex-shrink: 0;
  min-width: 22px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}
.item-tile code {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-mark {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  color: var(--text-3);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.item-tile:hover .copy-mark,
.item-tile.copied .copy-mark {
  opacity: 1;
}
.item-tile.copied .copy-mark {
  color: var(--success);
}
.note {
  flex-shrink: 0;
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.panel-swap-enter-active {
  transition: opacity var(--dur) var(--ease-out), translate var(--dur) var(--ease-out);
}
.panel-swap-leave-active {
  transition: opacity var(--dur-fast) ease-in, translate var(--dur-fast) ease-in;
}
.panel-swap-enter-from {
  opacity: 0;
  translate: 0 4px;
}
.panel-swap-leave-to {
  opacity: 0;
  translate: 0 -4px;
}

@media (max-width: 860px) {
  .password {
    flex: none;
    width: 100%;
    flex-direction: column;
  }
  .panel {
    flex: none;
  }
  .pw-top {
    flex-direction: column;
    align-items: stretch;
  }
  .pw-btns {
    justify-content: flex-end;
  }
}
</style>
