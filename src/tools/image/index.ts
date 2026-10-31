import { defineAsyncComponent } from "vue";
import { AppWindow, Crop, Eraser, Grid3x3, LayoutGrid, Minimize2, Pipette, Stamp } from "lucide-vue-next";
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
      id: "image-stitch",
      name: "图片拼接",
      desc: "多张图片横向、纵向或按宫格拼成一张",
      icon: LayoutGrid,
      component: defineAsyncComponent(() => import("./components/ImageStitch.vue")),
    },
    {
      id: "image-mosaic",
      name: "图片马赛克",
      desc: "框选或涂抹区域，打上马赛克或模糊，遮挡隐私信息",
      icon: Grid3x3,
      component: defineAsyncComponent(() => import("./components/ImageMosaic.vue")),
    },
    {
      id: "image-watermark",
      name: "图片水印",
      desc: "添加文字或图片水印，支持平铺和批量处理",
      icon: Stamp,
      component: defineAsyncComponent(() => import("./components/ImageWatermark.vue")),
    },
    {
      id: "image-removebg",
      name: "图片去背景",
      desc: "去除纯色背景变为透明，或换成白、蓝、红等底色",
      icon: Eraser,
      component: defineAsyncComponent(() => import("./components/ImageRemoveBg.vue")),
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
