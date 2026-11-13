import { defineAsyncComponent } from "vue";
import { Tv } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "bilibili-download",
  name: "B 站视频下载",
  desc: "粘贴 B 站视频链接，下载视频（MP4）、音频、封面和弹幕；支持多 P、选择清晰度和编码，登录后可下载高清",
  icon: Tv,
  component: defineAsyncComponent(() => import("./BilibiliDownload.vue")),
};

export default tool;
