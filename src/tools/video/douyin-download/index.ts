import { defineAsyncComponent } from "vue";
import { Music2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "douyin-download",
  platforms: ["desktop", "web"],
  name: "抖音下载",
  desc: "粘贴抖音分享链接，自动识别视频、图文和实况照片，保存到程序数据目录（桌面版）",
  icon: Music2,
  component: defineAsyncComponent(() => import("./DouyinDownload.vue")),
};

export default tool;
