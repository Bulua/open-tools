import { defineAsyncComponent } from "vue";
import { Fingerprint } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "hash",
  name: "哈希计算（MD5 / SHA）",
  desc: "计算文本或文件的 MD5、SHA-1、SHA-256、SHA-512",
  icon: Fingerprint,
  component: defineAsyncComponent(() => import("./HashCalc.vue")),
};

export default tool;
