import { defineAsyncComponent } from "vue";
import { Replace } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-convert",
  name: "图片格式转换",
  desc: "JPG、PNG、WebP 互相转换，支持 GIF、BMP 等输入，可批量处理",
  icon: Replace,
  component: defineAsyncComponent(() => import("./ImageCompress.vue")),
};

export default tool;
