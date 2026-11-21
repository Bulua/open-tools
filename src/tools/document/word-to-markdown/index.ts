import { defineAsyncComponent } from "vue";
import { FileDown } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "word-to-markdown",
  name: "Word 转 Markdown",
  desc: "将 Word 正文、图片、表格和公式转换为 Markdown，有图片时连同资源打包下载",
  icon: FileDown,
  component: defineAsyncComponent(() => import("./WordToMarkdown.vue")),
};
export default tool;
