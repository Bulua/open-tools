import { defineAsyncComponent } from "vue";
import { Grid3x3 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "image-mosaic",
  name: "图片马赛克",
  desc: "框选或涂抹区域，打上马赛克或模糊，遮挡隐私信息",
  icon: Grid3x3,
  component: defineAsyncComponent(() => import("./ImageMosaic.vue")),
};

export default tool;
