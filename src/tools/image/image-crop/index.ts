import { defineAsyncComponent } from "vue";
import { Crop } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-crop",
  name: "图片裁剪 / 改尺寸",
  desc: "按比例或自由裁剪，按像素或百分比调整图片尺寸，可以多张一起处理",
  icon: Crop,
  component: defineAsyncComponent(() => import("./ImageCrop.vue")),
};

export default tool;
