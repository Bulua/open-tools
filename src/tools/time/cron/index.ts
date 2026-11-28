import { defineAsyncComponent } from "vue";
import { CalendarClock } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "cron",
  name: "Cron 表达式",
  desc: "解析或按字段生成 Cron 表达式，显示含义和接下来的执行时间，支持 Linux / Spring / Quartz",
  icon: CalendarClock,
  component: defineAsyncComponent(() => import("./CronTool.vue")),
};

export default tool;
