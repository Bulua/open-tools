import { defineAsyncComponent } from "vue";
import { Palette } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "color",
  name: "颜色转换 HEX/RGB/HSL",
  desc: "颜色格式互转，带取色器",
  icon: Palette,
  component: defineAsyncComponent(() => import("./ColorConvert.vue")),
};

export default tool;
