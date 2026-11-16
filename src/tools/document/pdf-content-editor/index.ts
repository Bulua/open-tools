import { defineAsyncComponent } from "vue";
import { FilePenLine } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "pdf-content-editor",
  name: "PDF 内容编辑",
  desc: "修改可定位的 PDF 原文，添加文字、图片、手写签名和标注，支持撤销重做并导出，在本机处理",
  icon: FilePenLine,
  component: defineAsyncComponent(() => import("./PdfEditor.vue")),
};

export default tool;
