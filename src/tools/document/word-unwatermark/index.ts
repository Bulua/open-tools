import { defineAsyncComponent } from "vue";
import { Eraser } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "word-unwatermark",
  name: "Word 去水印",
  desc: "自动找出 Word、WPS 添加的水印，以及页眉里的艺术字、半透明图片等自制水印，勾选后一键去除，可批量处理",
  icon: Eraser,
  component: defineAsyncComponent(() => import("./WordUnwatermark.vue")),
};

export default tool;
