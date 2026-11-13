import { defineAsyncComponent } from "vue";
import { FolderArchive } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "extract",
  name: "文件解压",
  desc: "查看并解压 ZIP、TAR、TGZ、GZ，正确显示中文文件名",
  icon: FolderArchive,
  component: defineAsyncComponent(() => import("./ArchiveTool.vue")),
};

export default tool;
