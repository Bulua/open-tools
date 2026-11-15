import { defineAsyncComponent } from "vue";
import { RotateCw } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-rotate",
  name: "图片旋转 / 翻转",
  desc: "旋转 90°、任意角度旋转，水平或垂直翻转",
  icon: RotateCw,
  component: defineAsyncComponent(() => import("./ImageEdit.vue")),
};

export default tool;
