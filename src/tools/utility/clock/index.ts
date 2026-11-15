import { defineAsyncComponent } from "vue";
import { AlarmClock } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "clock",
  name: "时钟",
  desc: "设置闹钟和每周重复提醒，使用秒表计时与记录分段",
  icon: AlarmClock,
  component: defineAsyncComponent(() => import("./ClockTool.vue")),
};

export default tool;
