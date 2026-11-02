import { defineAsyncComponent } from "vue";
import { Eraser, FileStack, FileText, FileType2, Stamp } from "lucide-vue-next";
import type { Category } from "../types";

const document: Category = {
  id: "document",
  name: "文档",
  tools: [
    {
      id: "word-to-pdf",
      name: "Word 转 PDF",
      desc: "调用本机的 Word / WPS 转换，排版与原文档一致；可批量转换",
      icon: FileType2,
      component: defineAsyncComponent(() => import("./components/WordToPdf.vue")),
    },
    {
      id: "pdf-to-word",
      name: "PDF 转 Word",
      desc: "把 PDF 转成可编辑的 Word 文档；装有 Microsoft Word 时调用 Word 转换，否则使用内置转换；可批量转换",
      icon: FileText,
      component: defineAsyncComponent(() => import("./components/PdfToWord.vue")),
    },
    {
      id: "word-watermark",
      name: "Word 添加水印",
      desc: "给 .docx 添加文字或图片水印，与 Word 自带的水印相同，可批量处理",
      icon: Stamp,
      component: defineAsyncComponent(() => import("./components/WordWatermark.vue")),
    },
    {
      id: "word-unwatermark",
      name: "Word 去水印",
      desc: "自动找出 Word、WPS 添加的水印，以及页眉里的艺术字、半透明图片等自制水印，勾选后一键去除，可批量处理",
      icon: Eraser,
      component: defineAsyncComponent(() => import("./components/WordUnwatermark.vue")),
    },
    {
      id: "pdf-pages",
      name: "PDF 页面编辑",
      desc: "删除、旋转、调整 PDF 页面顺序，或把多个 PDF 合并为一个",
      icon: FileStack,
      component: defineAsyncComponent(() => import("./components/PdfPages.vue")),
    },
  ],
};

export default document;
