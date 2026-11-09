import { defineAsyncComponent } from "vue";
import { Clapperboard, FileImage, FileMusic, MonitorPlay, Music2, Music4, Scissors, Tv, Webcam } from "lucide-vue-next";
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
      platforms: ["desktop", "web"],
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
      id: "video-trim",
      name: "视频裁剪",
      desc: "拖动时间轴保留需要的一段，也可以框选画面区域、改成 16:9、9:16 等比例；只裁时长时不重新编码，快且无损",
      icon: Scissors,
      component: defineAsyncComponent(() => import("./components/VideoTrim.vue")),
    },
    {
      id: "video-to-gif",
      name: "视频转 GIF",
      desc: "把整段视频转成 GIF 动图，可设置帧率、宽度、颜色数和是否循环，在本机处理不上传",
      icon: FileImage,
      component: defineAsyncComponent(() => import("./components/VideoToGif.vue")),
    },
    {
      id: "video-concat",
      name: "视频拼接",
      desc: "把多段视频按顺序拼成一个 MP4；格式相同时直接拼接，不重新编码，速度快、画质无损",
      icon: Clapperboard,
      component: defineAsyncComponent(() => import("./components/VideoConcat.vue")),
    },
    {
      id: "video-music",
      name: "视频配乐",
      desc: "给视频加背景音乐，可调音乐和原声音量，选择循环播放或只播几次；画面不重新编码",
      icon: Music4,
      component: defineAsyncComponent(() => import("./components/VideoMusic.vue")),
    },
    {
      id: "screen-recorder",
      platforms: ["desktop", "web"],
      name: "屏幕录制",
      desc: "录制整个屏幕、某个窗口或浏览器标签页，可同时录系统声音和麦克风，录完预览并保存",
      icon: MonitorPlay,
      component: defineAsyncComponent(() => import("./components/VideoRecorder.vue")),
      props: { source: "screen" },
    },
    {
      id: "camera-recorder",
      platforms: ["desktop", "web"],
      name: "摄像头录制",
      desc: "用摄像头录一段视频，可同时录麦克风，录完预览并保存",
      icon: Webcam,
      component: defineAsyncComponent(() => import("./components/VideoRecorder.vue")),
      props: { source: "camera" },
    },
  ],
};

export default video;
