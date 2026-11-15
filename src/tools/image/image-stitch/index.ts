import { defineAsyncComponent } from "vue";
import { LayoutGrid } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-stitch",
  name: "图片拼接",
  desc: "多张图片横向、纵向或按宫格拼成一张，也能把手机截图拼成长截图",
  icon: LayoutGrid,
  component: defineAsyncComponent(() => import("./ImageStitch.vue")),
};

export default tool;
