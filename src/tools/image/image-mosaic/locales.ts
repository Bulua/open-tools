import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "image-mosaic": {
        "name": "Image Mosaic",
        "desc": "Select or brush over areas to pixelate or blur private information"
      }
    },
    "ja": {
      "image-mosaic": {
        "name": "画像モザイク",
        "desc": "範囲を選択または塗りつぶしてモザイクやぼかしをかけ、個人情報を隠します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "image": {
        "mosaicSuffix": "马赛克",
        "effect": "效果",
        "mosaic": "马赛克",
        "blur": "模糊",
        "strength": "强度",
        "selection": "选区",
        "mosaicDone": "已处理 {n} 处，导出为原格式（{format}）",
        "mosaicEmpty": "放入图片后，在图片上框选或涂抹",
        "rectHint": "在图片上拖动框选区域",
        "brushHint": "按住鼠标在图片上涂抹",
        "mosaicDropHint": "框选或涂抹需要遮挡的区域（人脸、车牌、手机号等）；也可以按 Ctrl + V 粘贴截图"
      }
    },
    "en": {
      "image": {
        "mosaicSuffix": "mosaic",
        "effect": "Effect",
        "mosaic": "Mosaic",
        "blur": "Blur",
        "strength": "Strength",
        "selection": "Selection",
        "mosaicDone": "{n} areas done; exported in the original format ({format})",
        "mosaicEmpty": "Add an image, then box or brush over areas on it",
        "rectHint": "Drag on the image to select an area",
        "brushHint": "Hold the mouse button and paint over the image",
        "mosaicDropHint": "Box or brush over what to hide (faces, license plates, phone numbers…); you can also paste a screenshot with Ctrl + V"
      }
    },
    "ja": {
      "image": {
        "mosaicSuffix": "モザイク",
        "effect": "効果",
        "mosaic": "モザイク",
        "blur": "ぼかし",
        "strength": "強さ",
        "selection": "範囲",
        "mosaicDone": "{n} 箇所を処理済み。元の形式（{format}）で書き出します",
        "mosaicEmpty": "画像を追加して、範囲を選択または塗りつぶしてください",
        "rectHint": "画像上をドラッグして範囲を選択",
        "brushHint": "マウスを押したまま画像上をなぞる",
        "mosaicDropHint": "隠したい部分（顔・ナンバープレート・電話番号など）を選択または塗りつぶします。Ctrl + V でスクリーンショットも貼り付けられます"
      }
    }
  }
});
