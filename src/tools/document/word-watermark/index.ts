import { defineAsyncComponent } from "vue";
import { Stamp } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "word-watermark",
  name: "Word 添加水印",
  desc: "给 .docx 添加文字或图片水印，与 Word 自带的水印相同，可批量处理",
  icon: Stamp,
  component: defineAsyncComponent(() => import("./WordWatermark.vue")),
};

export default tool;
