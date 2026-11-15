import { defineAsyncComponent } from "vue";
import { FileImage } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "xiaohongshu-download",
  platforms: ["desktop", "web"],
  name: "小红书下载",
  desc: "粘贴小红书分享链接，自动识别视频或图集，保存到程序数据目录（桌面版）",
  icon: FileImage,
  component: defineAsyncComponent(() => import("./XiaohongshuDownload.vue")),
};

export default tool;
