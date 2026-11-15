import { defineAsyncComponent } from "vue";
import { Minimize2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-compress",
  name: "图片压缩",
  desc: "批量压缩图片体积，可调质量、限制最大尺寸，显示压缩前后对比",
  icon: Minimize2,
  component: defineAsyncComponent(() => import("./ImageCompress.vue")),
};

export default tool;
