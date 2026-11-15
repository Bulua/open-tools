import { defineAsyncComponent } from "vue";
import { Eraser } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-removebg",
  platforms: ["desktop", "web"],
  name: "图片去背景",
  desc: "AI 自动识别人物、商品等主体去除背景，残留的背景点一下即可去掉；可换成白、蓝、红等底色",
  icon: Eraser,
  component: defineAsyncComponent(() => import("./ImageRemoveBg.vue")),
};

export default tool;
