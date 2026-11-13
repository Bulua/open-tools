import { defineAsyncComponent } from "vue";
import { SlidersHorizontal } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-adjust",
  name: "图片调色",
  desc: "调节亮度、对比度、饱和度、色相，一键套用黑白、复古等滤镜",
  icon: SlidersHorizontal,
  component: defineAsyncComponent(() => import("./ImageEdit.vue")),
};

export default tool;
