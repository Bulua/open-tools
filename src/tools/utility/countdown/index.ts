import { defineAsyncComponent } from "vue";
import { AlarmClock } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "countdown",
  name: "倒计时",
  desc: "到指定时间或计时器，可重复提醒；一直保存直到删除，到期弹出提醒",
  icon: AlarmClock,
  component: defineAsyncComponent(() => import("./CountdownTool.vue")),
};

export default tool;
