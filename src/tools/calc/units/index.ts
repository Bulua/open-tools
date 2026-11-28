import { defineAsyncComponent } from "vue";
import { Ruler } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "units",
  name: "单位换算",
  desc: "温度、长度、重量、面积、体积、数据、速度、时间、压力、能量、功率、角度、频率换算",
  icon: Ruler,
  component: defineAsyncComponent(() => import("./UnitConvert.vue")),
};

export default tool;
