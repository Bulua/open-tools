import { defineAsyncComponent } from "vue";
import { Music4 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "video-music",
  name: "视频配乐",
  desc: "给视频加背景音乐，可调音乐和原声音量，选择循环播放或只播几次；画面不重新编码",
  icon: Music4,
  component: defineAsyncComponent(() => import("./VideoMusic.vue")),
};

export default tool;
