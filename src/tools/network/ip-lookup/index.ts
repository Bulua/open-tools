import { defineAsyncComponent } from "vue";
import { Globe } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "ip-lookup",
  name: "IP 地址与位置查询",
  desc: "查看本机公网 IP、所在地区、经纬度和运营商，也可以查询任意 IP",
  icon: Globe,
  component: defineAsyncComponent(() => import("./IpLookup.vue")),
};

export default tool;
