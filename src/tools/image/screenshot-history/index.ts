import { defineAsyncComponent } from "vue";
import { History } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "screenshot-history",
  platforms: ["desktop", "web"],
  name: "截图与贴图",
  desc: "快捷键区域截图，支持标注、复制、固定到桌面，并按日期和小时查看历史截图",
  icon: History,
  component: defineAsyncComponent(() => import("./ScreenshotHistory.vue")),
};

export default tool;
