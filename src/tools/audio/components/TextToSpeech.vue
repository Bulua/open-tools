<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { Download, Gauge, Play, Square } from "lucide-vue-next";
import AppSelect from "@/components/common/AppSelect.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { saveFile } from "@/utils/saveFile";
import OutputFormat from "./OutputFormat.vue";
import { decodeFile, encodeAudio, usePlayer } from "../audio";
import type { Pcm } from "../pcm";
import { useOutputFormat } from "../useOutputFormat";

/**
 * 文字转语音：使用 Windows 自带的语音朗读，可以保存成音频文件（不需要联网）。
 * 浏览器预览时使用浏览器的朗读功能，只能播放，不能保存。
 */
const desktop = isTauri();
const text = useStoredRef("tts.text", "");
const voice = useStoredRef("tts.voice", "");
const rate = useStoredRef("tts.rate", 0);

interface VoiceOption {
  value: string;
  label: string;
  hint?: string;
}
const voices = ref<VoiceOption[]>([]);
const LANGS: Record<string, string> = { zh: "中文", en: "英文", ja: "日文", ko: "韩文", fr: "法文", de: "德文", es: "西班牙文" };
const langName = (culture: string) => LANGS[culture.split("-")[0]] ?? culture;

onMounted(async () => {
  if (desktop) {
    const { invoke } = await import("@tauri-apps/api/core");
    const list = await invoke<{ name: string; culture: string; gender: string }[]>("tts_voices").catch(() => []);
    voices.value = list.map((v) => ({
      value: v.name,
      label: v.name.replace(/^Microsoft\s+/, "").replace(/\s+Desktop$/, ""),
      hint: `${langName(v.culture)} · ${v.gender === "Female" ? "女声" : v.gender === "Male" ? "男声" : ""}`,
    }));
  } else {
    const load = () => {
      voices.value = speechSynthesis.getVoices().map((v) => ({ value: v.name, label: v.name.replace(/^Microsoft\s+/, ""), hint: langName(v.lang) }));
    };
    load();
    speechSynthesis.onvoiceschanged = load;
  }
});
// 没有选过或选过的语音不在了：优先选中文
watch(voices, (list) => {
  if (list.length && !list.some((v) => v.value === voice.value)) voice.value = (list.find((v) => v.hint?.startsWith("中文")) ?? list[0]).value;
});

const RATE_LABEL = computed(() => (rate.value === 0 ? "正常" : rate.value > 0 ? `快 ${rate.value}` : `慢 ${-rate.value}`));

// ---------- 生成与朗读 ----------
const player = usePlayer();
const busy = ref(false);
const speaking = ref(false);
const error = ref("");
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
  error.value = "";
  if (!text.value.trim()) return;
  if (!desktop) {
    const u = new SpeechSynthesisUtterance(text.value);
    const v = speechSynthesis.getVoices().find((x) => x.name === voice.value);
    if (v) u.voice = v;
    u.rate = rate.value >= 0 ? 1 + rate.value / 10 : 1 + rate.value / 20;
    u.onend = u.onerror = () => (speaking.value = false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    speaking.value = true;
    return;
  }
  busy.value = true;
  try {
    player.play(await synthesize());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
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
  error.value = "";
  try {
    const pcm = await synthesize();
    const name = text.value.trim().slice(0, 12).replace(/[\\/:*?"<>|\s]+/g, "_") || "语音";
    await saveFile(await encodeAudio(pcm, format.value, quality.value), `${name}.${format.value}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="tts">
    <aside class="card panel">
      <section class="section">
        <h3>声音</h3>
        <AppSelect v-model="voice" :options="voices" placeholder="正在读取本机语音…" />
        <h3>语速<span class="value">{{ RATE_LABEL }}</span></h3>
        <label class="slider">
          <Gauge :size="14" />
          <input v-model.number="rate" type="range" min="-10" max="10" @dblclick="rate = 0" />
        </label>
      </section>

      <section class="section">
        <button v-if="!isPlaying" class="btn full" :disabled="!text.trim() || busy" @click="speak">
          <Play :size="14" />{{ busy ? "正在生成…" : "朗读" }}
        </button>
        <button v-else class="btn full" @click="stopSpeaking"><Square :size="13" />停止</button>
      </section>

      <section class="section">
        <h3>保存为音频</h3>
        <template v-if="desktop">
          <OutputFormat />
          <button class="btn primary full" :disabled="!text.trim() || saving" @click="save">
            <Download :size="14" />{{ saving ? "正在生成…" : "保存音频" }}
          </button>
        </template>
        <p v-else class="tip">浏览器中只能朗读；保存音频请使用安装后的桌面版。</p>
        <p v-if="error" class="error">{{ error }}</p>
      </section>
    </aside>

    <section class="card editor">
      <div class="card-title">
        文字<span class="count">{{ text.length }} 字</span>
        <button v-if="text" class="btn small subtle push" @click="text = ''">清空</button>
      </div>
      <textarea v-model="text" spellcheck="false" placeholder="在这里输入或粘贴要朗读的文字" />
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
