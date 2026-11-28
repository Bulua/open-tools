import { defineAsyncComponent } from "vue";
import { Globe2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "timezone",
  name: "时区转换 / 世界时间",
  desc: "任意时区的时间互相换算，同时查看多个城市的当前时间和 24 小时对照",
  icon: Globe2,
  component: defineAsyncComponent(() => import("./TimezoneConvert.vue")),
};

export default tool;
