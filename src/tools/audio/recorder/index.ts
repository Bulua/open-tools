import { defineAsyncComponent } from "vue";
import { Mic } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "recorder",
  platforms: ["desktop", "web"],
  name: "录音机",
  desc: "用麦克风录音，可以暂停，录完试听并保存为 MP3 或 WAV",
  icon: Mic,
  component: defineAsyncComponent(() => import("./AudioRecorder.vue")),
};

export default tool;
