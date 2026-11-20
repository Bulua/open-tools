import { defineAsyncComponent } from "vue";
import { Video } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "x-download",
  platforms: ["desktop"],
  name: "X 视频下载",
  desc: "解析 X（原 Twitter）公开帖子，下载原始 MP4 视频",
  icon: Video,
  component: defineAsyncComponent(() => import("./XDownload.vue")),
};

export default tool;
