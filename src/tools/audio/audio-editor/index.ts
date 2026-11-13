import { defineAsyncComponent } from "vue";
import { AudioWaveform } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "audio-editor",
  name: "音频剪辑",
  desc: "在波形上选择片段，保留或删除，淡入淡出、调整音量",
  icon: AudioWaveform,
  component: defineAsyncComponent(() => import("./AudioEditor.vue")),
};

export default tool;
