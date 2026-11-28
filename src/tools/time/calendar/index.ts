import { defineAsyncComponent } from "vue";
import { CalendarDays } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "calendar",
  name: "日历",
  desc: "查看多年公历、农历日期和常见节日，每个月一张卡片",
  icon: CalendarDays,
  component: defineAsyncComponent(() => import("./CalendarTool.vue")),
};

export default tool;
