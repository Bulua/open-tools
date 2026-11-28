import { defineAsyncComponent } from "vue";
import { Hash } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "radix",
  name: "进制转换",
  desc: "二进制、八进制、十进制、十六进制及任意进制互转",
  icon: Hash,
  component: defineAsyncComponent(() => import("./RadixConvert.vue")),
};

export default tool;
