import { defineAsyncComponent } from "vue";
import { FileType2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "word-to-pdf",
  platforms: ["desktop", "web"],
  name: "Word 转 PDF",
  desc: "调用本机的 Word / WPS 转换，排版与原文档一致；可批量转换",
  icon: FileType2,
  component: defineAsyncComponent(() => import("./WordToPdf.vue")),
};

export default tool;
