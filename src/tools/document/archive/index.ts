import { defineAsyncComponent } from "vue";
import { FileArchive } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "archive",
  name: "文件压缩",
  desc: "把文件或文件夹打包成 ZIP，保留目录结构，可选压缩程度",
  icon: FileArchive,
  component: defineAsyncComponent(() => import("./ArchiveTool.vue")),
};

export default tool;
