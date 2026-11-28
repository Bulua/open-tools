import { defineAsyncComponent } from "vue";
import { Clock } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "timestamp",
  name: "时间戳转换",
  desc: "Unix 时间戳（秒 / 毫秒）与日期互转，查看当前时间戳",
  icon: Clock,
  component: defineAsyncComponent(() => import("./TimestampConvert.vue")),
};

export default tool;
