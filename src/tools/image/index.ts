import { defineAsyncComponent } from "vue";
import { AppWindow, Crop, Eraser, Grid3x3, History, LayoutGrid, Minimize2, Pipette, Printer, Replace, RotateCw, SlidersHorizontal, Stamp, WandSparkles } from "lucide-vue-next";
import type { Category } from "../types";

// 同一个界面组件按用途注册成多个工具
const compress = defineAsyncComponent(() => import("./components/ImageCompress.vue"));
const edit = defineAsyncComponent(() => import("./components/ImageEdit.vue"));

const image: Category = {
  id: "image",
  name: "图片",
  tools: [
    {
      id: "screenshot-history",
      platforms: ["desktop", "web"],
      name: "截图与贴图",
      desc: "快捷键区域截图，支持标注、复制、固定到桌面，并按日期和小时查看历史截图",
      icon: History,
      component: defineAsyncComponent(() => import("./screenshot/components/ScreenshotHistory.vue")),
    },
    {
      id: "image-compress",
      name: "图片压缩",
      desc: "批量压缩图片体积，可调质量、限制最大尺寸，显示压缩前后对比",
      icon: Minimize2,
      component: compress,
      props: { mode: "compress" },
    },
    {
      id: "image-convert",
      name: "图片格式转换",
      desc: "JPG、PNG、WebP 互相转换，支持 GIF、BMP 等输入，可批量处理",
      icon: Replace,
      component: compress,
      props: { mode: "convert" },
    },
    {
      id: "image-crop",
      name: "图片裁剪 / 改尺寸",
      desc: "按比例或自由裁剪，按像素或百分比调整图片尺寸，可以多张一起处理",
      icon: Crop,
      component: defineAsyncComponent(() => import("./components/ImageCrop.vue")),
    },
    {
      id: "image-rotate",
      name: "图片旋转 / 翻转",
      desc: "旋转 90°、任意角度旋转，水平或垂直翻转",
      icon: RotateCw,
      component: edit,
      props: { mode: "rotate" },
    },
    {
      id: "image-adjust",
      name: "图片调色",
      desc: "调节亮度、对比度、饱和度、色相，一键套用黑白、复古等滤镜",
      icon: SlidersHorizontal,
      component: edit,
      props: { mode: "adjust" },
    },
    {
      id: "image-stitch",
      name: "图片拼接",
      desc: "多张图片横向、纵向或按宫格拼成一张，也能把手机截图拼成长截图",
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
      platforms: ["desktop", "web"],
      name: "图片去背景",
      desc: "AI 自动识别人物、商品等主体去除背景，残留的背景点一下即可去掉；可换成白、蓝、红等底色",
      icon: Eraser,
      component: defineAsyncComponent(() => import("./components/ImageRemoveBg.vue")),
    },
    {
      id: "image-inpaint",
      platforms: ["desktop", "web"],
      name: "图片去水印",
      desc: "涂抹或框选水印、文字、杂物，AI 自动补全背景，大图也清晰",
      icon: WandSparkles,
      component: defineAsyncComponent(() => import("./components/ImageInpaint.vue")),
    },
    {
      id: "image-color",
      name: "图片取色",
      desc: "点击图片取色，自动提取主色调",
      icon: Pipette,
      component: defineAsyncComponent(() => import("./components/ImageColorPicker.vue")),
    },
    {
      id: "image-dpi",
      name: "修改图片 DPI",
      desc: "批量修改 JPG、PNG 记录的 DPI（如 72、300），像素和画质不变，可查看原图 DPI 和打印尺寸",
      icon: Printer,
      component: defineAsyncComponent(() => import("./components/ImageDpi.vue")),
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
