import { defineAsyncComponent } from "vue";
import { CaseSensitive } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "naming",
  name: "命名风格转换",
  desc: "变量名在驼峰、下划线、短横线、常量等写法之间转换",
  icon: CaseSensitive,
  component: defineAsyncComponent(() => import("./NamingConvert.vue")),
};

export default tool;
