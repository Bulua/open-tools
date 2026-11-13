import { defineAsyncComponent } from "vue";
import { Minimize2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "audio-compress",
  name: "音频压缩",
  desc: "调整音频码率，批量压缩为 MP3 或 M4A，并对比文件大小",
  icon: Minimize2,
  component: defineAsyncComponent(() => import("./MediaCompress.vue")),
};

export default tool;
