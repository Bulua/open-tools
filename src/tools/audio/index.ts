import { defineAsyncComponent } from "vue";
import { AudioWaveform, FileAudio, ListMusic, Mic, Speech } from "lucide-vue-next";
import type { Category } from "../types";

const audio: Category = {
  id: "audio",
  name: "音频",
  tools: [
    {
      id: "audio-convert",
      name: "音频格式转换",
      desc: "MP3、WAV、M4A、FLAC 等互转，也能从 MP4 等视频中提取声音",
      icon: FileAudio,
      component: defineAsyncComponent(() => import("./components/AudioConvert.vue")),
    },
    {
      id: "audio-editor",
      name: "音频剪辑",
      desc: "在波形上选择片段，保留或删除，淡入淡出、调整音量",
      icon: AudioWaveform,
      component: defineAsyncComponent(() => import("./components/AudioEditor.vue")),
    },
    {
      id: "audio-join",
      name: "音频拼接",
      desc: "把多段音频按顺序拼成一个，可以调整顺序、留空白",
      icon: ListMusic,
      component: defineAsyncComponent(() => import("./components/AudioJoin.vue")),
    },
    {
      id: "recorder",
      platforms: ["desktop", "web"],
      name: "录音机",
      desc: "用麦克风录音，可以暂停，录完试听并保存为 MP3 或 WAV",
      icon: Mic,
      component: defineAsyncComponent(() => import("./components/AudioRecorder.vue")),
    },
    {
      id: "tts",
      platforms: ["desktop", "web"],
      name: "文字转语音",
      desc: "用 Windows 自带的语音朗读文字，可以保存成音频文件",
      icon: Speech,
      component: defineAsyncComponent(() => import("./components/TextToSpeech.vue")),
    },
  ],
};

export default audio;
