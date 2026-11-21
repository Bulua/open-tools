import { defineAsyncComponent } from "vue";
import { Video } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "weibo-download",
  name: "微博视频下载",
  desc: "解析公开微博帖子、视频页和分享短链接，下载 MP4 视频",
  icon: Video,
  component: defineAsyncComponent(() => import("./WeiboDownload.vue")),
};

export default tool;
