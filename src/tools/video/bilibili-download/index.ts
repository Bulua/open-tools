import { defineAsyncComponent } from "vue";
import { Tv } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "bilibili-download",
  name: "B 站视频下载",
  desc: "粘贴 B 站链接下载视频，自动选择画质并保存到程序数据目录，支持多 P 和下载后本地播放",
  icon: Tv,
  component: defineAsyncComponent(() => import("./BilibiliDownload.vue")),
};

export default tool;
