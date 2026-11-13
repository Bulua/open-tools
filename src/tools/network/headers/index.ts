import { defineAsyncComponent } from "vue";
import { FileJson2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "headers",
  name: "Header 转 JSON / cURL",
  desc: "把浏览器复制的请求头、cURL 命令转成 JSON、cURL、fetch、Python 代码",
  icon: FileJson2,
  component: defineAsyncComponent(() => import("./HeaderConvert.vue")),
  sessions: true,
};

export default tool;
