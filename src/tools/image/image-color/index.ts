import { defineAsyncComponent } from "vue";
import { Pipette } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-color",
  name: "图片取色",
  desc: "点击图片取色，自动提取主色调",
  icon: Pipette,
  component: defineAsyncComponent(() => import("./ImageColorPicker.vue")),
};

export default tool;
