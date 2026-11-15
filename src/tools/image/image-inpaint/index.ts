import { defineAsyncComponent } from "vue";
import { WandSparkles } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-inpaint",
  platforms: ["desktop", "web"],
  name: "图片去水印",
  desc: "涂抹或框选水印、文字、杂物，AI 自动补全背景，大图也清晰",
  icon: WandSparkles,
  component: defineAsyncComponent(() => import("./ImageInpaint.vue")),
};

export default tool;
