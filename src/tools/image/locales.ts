import { defineModuleLocales } from "@/locales/types";

/** 图片模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    "image-compress": { name: "Image Compressor", desc: "Shrink images in bulk with adjustable quality and maximum size, and compare before and after" },
    "image-convert": { name: "Image Format Converter", desc: "Convert between JPG, PNG and WebP; also accepts GIF, BMP and more; batch processing" },
    "image-crop": { name: "Crop / Resize Image", desc: "Crop to a ratio or freely, and resize by pixels or percentage" },
    "image-rotate": { name: "Rotate / Flip Image", desc: "Rotate by 90° or any angle, flip horizontally or vertically" },
    "image-adjust": { name: "Image Color Adjust", desc: "Tune brightness, contrast, saturation and hue, or apply filters like black & white and vintage" },
    "image-stitch": { name: "Image Stitcher", desc: "Combine several images horizontally, vertically or in a grid" },
    "image-mosaic": { name: "Image Mosaic", desc: "Select or brush over areas to pixelate or blur private information" },
    "image-watermark": { name: "Image Watermark", desc: "Add text or image watermarks, tiled or single, in batches" },
    "image-removebg": {
      name: "Background Remover",
      desc: "AI finds the subject (people, products…) and removes the background; click leftovers to erase them; fill with white, blue, red and more",
    },
    "image-color": { name: "Image Color Picker", desc: "Click an image to pick colors and extract its main palette" },
    ico: { name: "ICO Icon Generator", desc: "Turn an image into a multi-size ICO icon (website favicon, app icon)" },
  },
});
