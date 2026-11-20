import { Plug } from "lucide-vue-next";
import { defineAsyncComponent } from "vue";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "mcp-inspector",
  name: "MCP 工具查看器",
  desc: "管理 MCP 连接、浏览工具并测试调用",
  icon: Plug,
  platforms: ["desktop"],
  component: defineAsyncComponent(() => import("./McpInspector.vue")),
};
export default tool;
