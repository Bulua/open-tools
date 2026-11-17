import { defineAsyncComponent } from "vue";
import { Radio } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "mqtt-client",
  name: "MQTT 连接测试",
  desc: "连接 MQTT 服务器，订阅主题并收发消息",
  icon: Radio,
  platforms: ["desktop", "web"],
  component: defineAsyncComponent(() => import("./MqttWorkspace.vue")),
};
export default tool;
