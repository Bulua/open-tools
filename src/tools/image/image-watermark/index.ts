import { defineAsyncComponent } from "vue";
import { Stamp } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-watermark",
  name: "图片水印",
  desc: "添加文字或图片水印，支持平铺和批量处理",
  icon: Stamp,
  component: defineAsyncComponent(() => import("./ImageWatermark.vue")),
};

export default tool;
