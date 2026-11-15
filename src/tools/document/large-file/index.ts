import { defineAsyncComponent } from "vue";
import { FilePenLine } from "lucide-vue-next";
import type { Tool } from "../../types";

const tool: Tool = {
  id: "large-file",
  name: "大文件编辑器",
  desc: "分块查看和编辑大型 TXT、LOG 文件，支持查找、跳转、撤销重做，保存回原文件",
  icon: FilePenLine,
  component: defineAsyncComponent(() => import("./LargeFileEditor.vue")),
  platforms: ["desktop"],
};
export default tool;
