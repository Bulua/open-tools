import { defineAsyncComponent } from "vue";
import { Minimize2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "video-compress",
  name: "视频压缩",
  desc: "调整视频分辨率与音视频码率，批量压缩为 MP4",
  icon: Minimize2,
  component: defineAsyncComponent(() => import("./MediaCompress.vue")),
};

export default tool;
