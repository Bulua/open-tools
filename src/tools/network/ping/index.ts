import { defineAsyncComponent } from "vue";
import { Activity } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "ping",
  name: "Ping 网络测试",
  desc: "测试到某个地址的网络延迟和丢包率",
  icon: Activity,
  component: defineAsyncComponent(() => import("./PingTool.vue")),
};

export default tool;
