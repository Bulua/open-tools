import { defineAsyncComponent } from "vue";
import { FileStack } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "pdf-pages",
  name: "PDF 页面编辑",
  desc: "删除、旋转、调整 PDF 页面顺序，或把多个 PDF 合并为一个",
  icon: FileStack,
  component: defineAsyncComponent(() => import("./PdfPages.vue")),
};

export default tool;
