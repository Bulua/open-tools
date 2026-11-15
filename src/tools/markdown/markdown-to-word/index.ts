import { defineAsyncComponent } from "vue";
import { FileOutput } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "markdown-to-word",
  name: "Markdown 转 Word",
  desc: "把 .md 文件批量转换为 Word 文档，保留标题、列表、表格、代码块和图片",
  icon: FileOutput,
  component: defineAsyncComponent(() => import("./MarkdownToWord.vue")),
};

export default tool;
