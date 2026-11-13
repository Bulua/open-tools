import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "image-color": {
        "name": "Image Color Picker",
        "desc": "Click an image to pick colors and extract its main palette"
      }
    },
    "ja": {
      "image-color": {
        "name": "画像の色を取得",
        "desc": "画像をクリックして色を取得し、メインカラーを自動抽出します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "image": {
        "currentColor": "当前颜色",
        "palette": "主色调",
        "paletteEmpty": "放入图片后自动提取",
        "colorShare": "{hex}，约占 {n}%",
        "picked": "已取颜色",
        "pickedEmpty": "点击图片取到的颜色会出现在这里",
        "pickHint": "点击图片取色，滚轮缩放，按住拖动",
        "pickDropHint": "点击图片任意位置取色，并自动提取主色调；也可以按 Ctrl + V 粘贴截图"
      }
    },
    "en": {
      "image": {
        "currentColor": "Current color",
        "palette": "Main colors",
        "paletteEmpty": "Extracted automatically once you add an image",
        "colorShare": "{hex}, about {n}%",
        "picked": "Picked colors",
        "pickedEmpty": "Colors you click on the image appear here",
        "pickHint": "Click to pick a color, scroll to zoom, drag to pan",
        "pickDropHint": "Click anywhere on the image to pick a color; main colors are extracted automatically. You can also paste a screenshot with Ctrl + V"
      }
    },
    "ja": {
      "image": {
        "currentColor": "現在の色",
        "palette": "メインカラー",
        "paletteEmpty": "画像を追加すると自動で抽出します",
        "colorShare": "{hex}、約 {n}%",
        "picked": "取得した色",
        "pickedEmpty": "画像をクリックして取得した色がここに表示されます",
        "pickHint": "クリックで色を取得、ホイールで拡大縮小、ドラッグで移動",
        "pickDropHint": "画像の任意の場所をクリックして色を取得し、メインカラーを自動で抽出します。Ctrl + V でスクリーンショットも貼り付けられます"
      }
    }
  }
});
