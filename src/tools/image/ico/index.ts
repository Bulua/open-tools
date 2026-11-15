import { defineAsyncComponent } from "vue";
import { AppWindow } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "ico",
  name: "ICO 图标生成",
  desc: "把图片生成多尺寸 ICO 图标（网站 favicon、程序图标）",
  icon: AppWindow,
  component: defineAsyncComponent(() => import("./IcoGenerate.vue")),
};

export default tool;
