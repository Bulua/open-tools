import { defineAsyncComponent } from "vue";
import { Activity, FileJson2, Globe } from "lucide-vue-next";
import type { Category } from "../types";

const network: Category = {
  id: "network",
  name: "网络",
  tools: [
    {
      id: "ip-lookup",
      name: "IP 地址与位置查询",
      desc: "查看本机公网 IP、所在地区、经纬度和运营商，也可以查询任意 IP",
      icon: Globe,
      component: defineAsyncComponent(() => import("./components/IpLookup.vue")),
    },
    {
      id: "ping",
      name: "Ping 网络测试",
      desc: "测试到某个地址的网络延迟和丢包率",
      icon: Activity,
      component: defineAsyncComponent(() => import("./components/PingTool.vue")),
    },
    {
      id: "headers",
      name: "Header 转 JSON / cURL",
      desc: "把浏览器复制的请求头、cURL 命令转成 JSON、cURL、fetch、Python 代码",
      icon: FileJson2,
      component: defineAsyncComponent(() => import("./components/HeaderConvert.vue")),
      sessions: true,
    },
  ],
};

export default network;
