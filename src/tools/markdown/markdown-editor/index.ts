import { defineAsyncComponent } from "vue";
import { NotebookPen } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "markdown-editor",
  name: "Markdown 编辑预览",
  desc: "左侧编辑、右侧实时预览，支持表格、任务列表、代码高亮，可导出 Word 和 HTML",
  icon: NotebookPen,
  component: defineAsyncComponent(() => import("./MarkdownEditor.vue")),
  sessions: true,
};

export default tool;
