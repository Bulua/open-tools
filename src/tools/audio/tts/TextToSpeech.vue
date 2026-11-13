<script setup lang="ts">
import { recordToolUsage } from "@/composables/toolLibrary";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { Download, Gauge, Play, Square } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { locale } from "@/locales";
import AppSelect from "@/components/common/AppSelect.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import { showError } from "@/utils/errorToast";
import OutputFormat from "../shared/components/OutputFormat.vue";
import { decodeFile, encodeAudio, usePlayer } from "../shared/audio";
import type { Pcm } from "../shared/pcm";
import { useOutputFormat } from "../shared/useOutputFormat";

/**
 * 文字转语音：使用 Windows 自带的语音朗读，可以保存成音频文件（不需要联网）。
 * 浏览器预览时使用浏览器的朗读功能，只能播放，不能保存。
 */
const { t } = useI18n();
const desktop = isTauri();
const text = useStoredRef("tts.text", "");
const voice = useStoredRef("tts.voice", "");
const rate = useStoredRef("tts.rate", 0);

/** 本机的一个语音；culture 是语言代码（如 zh-CN），gender 只有桌面版有 */
interface Voice {
  name: string;
  label: string;
  culture: string;
  gender?: string;
}
const rawVoices = ref<Voice[]>([]);
/** 语言名跟着界面语言显示，例如 zh → 中文 / Chinese */
const langName = (culture: string) => {
  try {
    return new Intl.DisplayNames([locale.value], { type: "language" }).of(culture.split("-")[0]) ?? culture;
  } catch {
    return culture;
  }
};
const genderName = (g?: string) => (g === "Female" ? t("audio.female") : g === "Male" ? t("audio.male") : "");
const voices = computed(() =>
  rawVoices.value.map((v) => ({ value: v.name, label: v.label, hint: [langName(v.culture), genderName(v.gender)].filter(Boolean).join(" · ") })),
);

onMounted(async () => {
  if (desktop) {
    const { invoke } = await import("@tauri-apps/api/core");
    const list = await invoke<{ name: string; culture: string; gender: string }[]>("tts_voices").catch(() => []);
    rawVoices.value = list.map((v) => ({
      name: v.name,
      label: v.name.replace(/^Microsoft\s+/, "").replace(/\s+Desktop$/, ""),
      culture: v.culture,
      gender: v.gender,
    }));
  } else {
    const load = () => {
      rawVoices.value = speechSynthesis.getVoices().map((v) => ({ name: v.name, label: v.name.replace(/^Microsoft\s+/, ""), culture: v.lang }));
    };
    load();
    speechSynthesis.onvoiceschanged = load;
  }
});
// 没有选过或选过的语音不在了：优先选中文
watch(rawVoices, (list) => {
  if (list.length && !list.some((v) => v.name === voice.value)) voice.value = (list.find((v) => v.culture.startsWith("zh")) ?? list[0]).name;
});

const RATE_LABEL = computed(() => (rate.value === 0 ? t("audio.rateNormal") : rate.value > 0 ? t("audio.rateFast", { n: rate.value }) : t("audio.rateSlow", { n: -rate.value })));

// ---------- 生成与朗读 ----------
const player = usePlayer();
const busy = ref(false);
const speaking = ref(false);
/** 最近生成的语音，文字和设置没变时直接复用 */
const cache = shallowRef<{ key: string; pcm: Pcm } | null>(null);
const cacheKey = computed(() => `${voice.value}|${rate.value}|${text.value}`);

const synthesize = async (): Promise<Pcm> => {
  if (cache.value?.key === cacheKey.value) return cache.value.pcm;
  const { invoke } = await import("@tauri-apps/api/core");
  const wav = await invoke<ArrayBuffer>("tts_synthesize", { text: text.value, voice: voice.value, rate: rate.value });
  const pcm = await decodeFile(new Blob([wav]));
  cache.value = { key: cacheKey.value, pcm };
  return pcm;
};

const speak = async () => {
  if (!text.value.trim()) return;
  if (!desktop) {
    const u = new SpeechSynthesisUtterance(text.value);
    const v = speechSynthesis.getVoices().find((x) => x.name === voice.value);
    if (v) u.voice = v;
    u.rate = rate.value >= 0 ? 1 + rate.value / 10 : 1 + rate.value / 20;
    u.onend = u.onerror = () => (speaking.value = false);
    u.onstart = () => recordToolUsage();
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    speaking.value = true;
    return;
  }
  busy.value = true;
  try {
    player.play(await synthesize());
    recordToolUsage();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
};
const stopSpeaking = () => {
  if (desktop) player.stop();
  else {
    speechSynthesis.cancel();
    speaking.value = false;
  }
};
const isPlaying = computed(() => (desktop ? player.playing.value : speaking.value));
onBeforeUnmount(() => !desktop && speechSynthesis.cancel());

const { format, quality } = useOutputFormat();
const saving = ref(false);
const save = async () => {
  saving.value = true;
  try {
    const pcm = await synthesize();
    const name = text.value.trim().slice(0, 12).replace(/[\\/:*?"<>|\s]+/g, "_") || t("audio.speechName");
    await saveFile(await encodeAudio(pcm, format.value, quality.value), `${name}.${format.value}`);
  } catch (e) {
    showError(e);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="tts">
    <aside class="card panel">
      <section class="section">
        <h3>{{ t("audio.voice") }}</h3>
        <AppSelect v-model="voice" :options="voices" :placeholder="t('audio.loadingVoices')" />
        <h3>{{ t("audio.rate") }}<span class="value">{{ RATE_LABEL }}</span></h3>
        <label class="slider">
          <Gauge :size="14" />
          <input v-model.number="rate" type="range" min="-10" max="10" @dblclick="rate = 0" />
        </label>
      </section>

      <section class="section">
        <button v-if="!isPlaying" class="btn full" :disabled="!text.trim() || busy" @click="speak">
          <Play :size="14" />{{ busy ? t("audio.generating") : t("audio.speak") }}
        </button>
        <button v-else class="btn full" @click="stopSpeaking"><Square :size="13" />{{ t("audio.stop") }}</button>
      </section>

      <section class="section">
        <h3>{{ t("audio.saveAsAudio") }}</h3>
        <template v-if="desktop">
          <OutputFormat />
          <button class="btn primary full" :disabled="!text.trim() || saving" @click="save">
            <Download :size="14" />{{ saving ? t("audio.generating") : t("audio.saveAudio") }}
          </button>
        </template>
        <p v-else class="tip">{{ t("audio.browserOnly") }}</p>
      </section>
    </aside>

    <section class="card editor">
      <div class="card-title">
        {{ t("audio.text") }}<span class="count">{{ t("audio.chars", { n: text.length }) }}</span>
        <button v-if="text" class="btn small subtle push" @click="text = ''">{{ t("audio.clear") }}</button>
      </div>
      <textarea v-model="text" spellcheck="false" :placeholder="t('audio.textPlaceholder')" />
    </section>
  </div>
</template>

<style scoped>
.tts {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.panel {
  flex: 0 0 280px;
  align-self: flex-start;
}
h3 {
  display: flex;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.value {
  margin-left: auto;
  font-weight: 400;
  color: var(--text-3);
}
.editor {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.count {
  font-weight: 400;
  color: var(--text-3);
}
.push {
  margin-left: auto;
}
textarea {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  padding: 14px 16px;
  background: transparent;
  font-size: 15px;
  line-height: 1.8;
  color: var(--text);
}
textarea::placeholder {
  color: var(--text-3);
}
</style>
