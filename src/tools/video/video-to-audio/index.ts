import { defineAsyncComponent } from "vue";
import { FileMusic } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "video-to-audio",
  name: "视频转音频",
  desc: "提取视频里的声音，可直接复制原始音轨（最快、无损），或转成 MP3、M4A、WAV；可批量处理",
  icon: FileMusic,
  component: defineAsyncComponent(() => import("./VideoToAudio.vue")),
};

export default tool;
