import { defineAsyncComponent } from "vue";
import { Braces } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "json-format",
  name: "JSON 格式化",
  desc: "美化、压缩、树形查看 JSON，实时校验并定位错误",
  icon: Braces,
  component: defineAsyncComponent(() => import("./JsonFormat.vue")),
  sessions: true,
};

export default tool;
