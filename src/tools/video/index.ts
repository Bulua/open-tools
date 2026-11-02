import { defineAsyncComponent } from "vue";
import { Clapperboard, FileMusic } from "lucide-vue-next";
import type { Category } from "../types";

const video: Category = {
  id: "video",
  name: "视频",
  tools: [
    {
      id: "video-to-audio",
      name: "视频转音频",
      desc: "提取视频里的声音，可直接复制原始音轨（最快、无损），或转成 MP3、M4A、WAV；可批量处理",
      icon: FileMusic,
      component: defineAsyncComponent(() => import("./components/VideoToAudio.vue")),
    },
    {
      id: "video-concat",
      name: "视频拼接",
      desc: "把多段视频按顺序拼成一个 MP4；格式相同时直接拼接，不重新编码，速度快、画质无损",
      icon: Clapperboard,
      component: defineAsyncComponent(() => import("./components/VideoConcat.vue")),
    },
  ],
};

export default video;
