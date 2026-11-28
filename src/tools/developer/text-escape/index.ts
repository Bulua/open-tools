import { defineAsyncComponent } from "vue";
import { Link2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "text-escape",
  name: "URL/Unicode/HTML 编码",
  desc: "URL 参数编码、中文转 \\uXXXX、HTML 特殊字符转义，双向实时转换",
  icon: Link2,
  component: defineAsyncComponent(() => import("./TextEscape.vue")),
};

export default tool;
