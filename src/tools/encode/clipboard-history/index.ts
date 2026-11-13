import { defineAsyncComponent } from "vue";
import { ClipboardList } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "clipboard-history",
  name: "剪贴板历史",
  desc: "自动记录复制过的纯文本，按日期查找并再次复制",
  icon: ClipboardList,
  component: defineAsyncComponent(() => import("./ClipboardHistory.vue")),
  platforms: ["desktop"],
};

export default tool;
