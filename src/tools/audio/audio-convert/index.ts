import { defineAsyncComponent } from "vue";
import { FileAudio } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "audio-convert",
  name: "音频格式转换",
  desc: "MP3、WAV、M4A、FLAC 等互转，也能从 MP4 等视频中提取声音",
  icon: FileAudio,
  component: defineAsyncComponent(() => import("./AudioConvert.vue")),
};

export default tool;
