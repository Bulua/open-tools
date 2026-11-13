import { defineAsyncComponent } from "vue";
import { Regex } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "regex",
  name: "正则表达式测试",
  desc: "实时高亮匹配结果，查看分组，预览替换效果",
  icon: Regex,
  component: defineAsyncComponent(() => import("./RegexTester.vue")),
  sessions: true,
};

export default tool;
