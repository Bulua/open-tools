import { defineAsyncComponent } from "vue";
import { AppWindow, Crop, Minimize2, Pipette } from "lucide-vue-next";
import type { Category } from "../types";

const image: Category = {
  id: "image",
  name: "图片",
  tools: [
    {
      id: "image-compress",
      name: "图片压缩 / 格式转换",
      desc: "批量压缩图片，转换 JPG / PNG / WebP，限制最大尺寸",
      icon: Minimize2,
      component: defineAsyncComponent(() => import("./components/ImageCompress.vue")),
    },
    {
      id: "image-edit",
      name: "图片裁剪 / 旋转 / 调色",
      desc: "裁剪、旋转、翻转、调整尺寸，调节亮度、对比度、饱和度",
      icon: Crop,
      component: defineAsyncComponent(() => import("./components/ImageEdit.vue")),
    },
    {
      id: "image-color",
      name: "图片取色",
      desc: "点击图片取色，自动提取主色调",
      icon: Pipette,
      component: defineAsyncComponent(() => import("./components/ImageColorPicker.vue")),
    },
    {
      id: "ico",
      name: "ICO 图标生成",
      desc: "把图片生成多尺寸 ICO 图标（网站 favicon、程序图标）",
      icon: AppWindow,
      component: defineAsyncComponent(() => import("./components/IcoGenerate.vue")),
    },
  ],
};

export default image;
