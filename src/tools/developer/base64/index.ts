import { defineAsyncComponent } from "vue";
import { Binary } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "base64",
  name: "Base64 编解码",
  desc: "文本、图片、任意文件与 Base64 互相转换，解码后可下载",
  icon: Binary,
  component: defineAsyncComponent(() => import("./Base64.vue")),
};

export default tool;
