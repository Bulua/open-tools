import { defineAsyncComponent } from "vue";
import { FileX2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "pdf-unwatermark",
  name: "PDF 去水印",
  desc: "自动找出 Acrobat、WPS 等工具添加的水印，以及斜着、半透明、每页重复的文字和图片水印，勾选后一键去除，可批量处理",
  icon: FileX2,
  component: defineAsyncComponent(() => import("./PdfUnwatermark.vue")),
};

export default tool;
