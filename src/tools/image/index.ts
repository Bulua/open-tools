import type { Category } from "../types";
import screenshotHistory from "./screenshot-history";
import imageCompress from "./image-compress";
import imageConvert from "./image-convert";
import imageCrop from "./image-crop";
import imageRotate from "./image-rotate";
import imageAdjust from "./image-adjust";
import imageStitch from "./image-stitch";
import imageMosaic from "./image-mosaic";
import imageWatermark from "./image-watermark";
import imageRemovebg from "./image-removebg";
import imageInpaint from "./image-inpaint";
import imageColor from "./image-color";
import imageDpi from "./image-dpi";
import ico from "./ico";

const image: Category = {
  id: "image",
  name: "图片",
  tools: [screenshotHistory, imageCompress, imageConvert, imageCrop, imageRotate, imageAdjust, imageStitch, imageMosaic, imageWatermark, imageRemovebg, imageInpaint, imageColor, imageDpi, ico],
};

export default image;
