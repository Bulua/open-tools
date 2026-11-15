import { defineAsyncComponent } from "vue";
import { MonitorPlay } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "screen-recorder",
  platforms: ["desktop", "web"],
  name: "屏幕录制",
  desc: "录制整个屏幕、某个窗口或浏览器标签页，可同时录系统声音和麦克风，录完预览并保存",
  icon: MonitorPlay,
  component: defineAsyncComponent(() => import("./VideoRecorder.vue")),
};

export default tool;
