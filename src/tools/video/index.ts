import { defineAsyncComponent } from "vue";
import { Clapperboard, FileMusic, Music2, Tv } from "lucide-vue-next";
import type { Category } from "../types";

const video: Category = {
  id: "video",
  name: "视频",
  tools: [
    {
      id: "bilibili-download",
      name: "B 站视频下载",
      desc: "粘贴 B 站视频链接，下载视频（MP4）、音频、封面和弹幕；支持多 P、选择清晰度和编码，登录后可下载高清",
      icon: Tv,
      component: defineAsyncComponent(() => import("./components/BilibiliDownload.vue")),
    },
    {
      id: "douyin-download",
      name: "抖音下载",
      desc: "粘贴抖音分享链接，下载无水印视频、图文原图、实况照片、背景音乐和封面（桌面版）",
      icon: Music2,
      component: defineAsyncComponent(() => import("./components/DouyinDownload.vue")),
    },
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
