import { defineAsyncComponent } from "vue";
import { Printer } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-dpi",
  name: "修改图片 DPI",
  desc: "批量修改 JPG、PNG 记录的 DPI（如 72、300），像素和画质不变，可查看原图 DPI 和打印尺寸",
  icon: Printer,
  component: defineAsyncComponent(() => import("./ImageDpi.vue")),
};

export default tool;
