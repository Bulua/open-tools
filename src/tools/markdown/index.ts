import { defineAsyncComponent } from "vue";
import { FileOutput, NotebookPen } from "lucide-vue-next";
import type { Category } from "../types";

const markdown: Category = {
  id: "markdown",
  name: "Markdown",
  tools: [
    {
      id: "markdown-editor",
      name: "Markdown 编辑预览",
      desc: "左侧编辑、右侧实时预览，支持表格、任务列表、代码高亮，可导出 Word 和 HTML",
      icon: NotebookPen,
      component: defineAsyncComponent(() => import("./components/MarkdownEditor.vue")),
      sessions: true,
    },
    {
      id: "markdown-to-word",
      name: "Markdown 转 Word",
      desc: "把 .md 文件批量转换为 Word 文档，保留标题、列表、表格、代码块和图片",
      icon: FileOutput,
      component: defineAsyncComponent(() => import("./components/MarkdownToWord.vue")),
    },
  ],
};

export default markdown;
