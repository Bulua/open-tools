import { defineAsyncComponent } from "vue";
import { Calculator } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "calculator",
  name: "计算器",
  desc: "输入算式即时计算，支持括号、乘方、开方、三角函数和历史记录",
  icon: Calculator,
  component: defineAsyncComponent(() => import("./CalculatorTool.vue")),
};

export default tool;
