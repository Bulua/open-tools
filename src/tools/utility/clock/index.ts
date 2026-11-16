import { defineAsyncComponent } from "vue";
import { AlarmClock } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "clock",
  name: "时钟",
  desc: "设置闹钟和重复提醒，使用秒表记录分段，同时运行多个倒计时",
  icon: AlarmClock,
  component: defineAsyncComponent(() => import("./ClockTool.vue")),
};

export default tool;
