import { defineAsyncComponent } from "vue";
import { GitCompare } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "json-diff",
  name: "JSON 差异对比",
  desc: "对比两段 JSON，列出新增、删除和修改的字段",
  icon: GitCompare,
  component: defineAsyncComponent(() => import("./JsonDiff.vue")),
  sessions: true,
};

export default tool;
