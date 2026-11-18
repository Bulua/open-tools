import { defineAsyncComponent } from "vue";
import { Notebook } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "notebook",
  name: "笔记本",
  desc: "用文件夹整理笔记，在同一编辑区输入并即时排版 Markdown",
  icon: Notebook,
  component: defineAsyncComponent(() => import("./Notebook.vue")),
};

export default tool;
