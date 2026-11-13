import { defineAsyncComponent } from "vue";
import { Speech } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "tts",
  platforms: ["desktop", "web"],
  name: "文字转语音",
  desc: "用 Windows 自带的语音朗读文字，可以保存成音频文件",
  icon: Speech,
  component: defineAsyncComponent(() => import("./TextToSpeech.vue")),
};

export default tool;
