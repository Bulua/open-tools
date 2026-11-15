import { defineAsyncComponent } from "vue";
import { FileText } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "pdf-to-word",
  name: "PDF 转 Word",
  desc: "把 PDF 转成可编辑的 Word 文档；装有 Microsoft Word 时调用 Word 转换，否则使用内置转换；可批量转换",
  icon: FileText,
  component: defineAsyncComponent(() => import("./PdfToWord.vue")),
};

export default tool;
