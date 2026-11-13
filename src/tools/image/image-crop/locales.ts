import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "image-crop": {
        "name": "Crop / Resize Image",
        "desc": "Crop to a ratio or freely, and resize by pixels or percentage; works on several images at once"
      }
    },
    "ja": {
      "image-crop": {
        "name": "画像の切り抜き / サイズ変更",
        "desc": "比率を指定または自由に切り抜き、ピクセルやパーセントでサイズを変更します。複数の画像をまとめて処理できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "image": {
        "suffixCrop": "裁剪",
        "hintCrop": "可以一次放入多张，拖动裁剪框选择区域，可以固定比例；也可以按像素或百分比调整尺寸",
        "crop": "裁剪",
        "cropViewHint": "滚轮缩放，拖动空白处平移",
        "cropResetTitle": "恢复成整张图、原尺寸",
        "cropDownloadAll": "全部下载（{n} 张）",
        "cropZipName": "裁剪后的图片",
        "resize": "调整尺寸",
        "width": "宽",
        "height": "高",
        "ratioLocked": "保持比例（点击解除）",
        "ratioUnlocked": "不保持比例（点击锁定）"
      }
    },
    "en": {
      "image": {
        "suffixCrop": "cropped",
        "hintCrop": "Add several at once, drag the crop box to select an area, optionally with a fixed ratio; or resize by pixels or percentage",
        "crop": "Crop",
        "cropViewHint": "Scroll to zoom, drag empty space to pan",
        "cropResetTitle": "Back to the whole image at original size",
        "cropDownloadAll": "Download all ({n})",
        "cropZipName": "cropped images",
        "resize": "Resize",
        "width": "W",
        "height": "H",
        "ratioLocked": "Keep ratio (click to unlock)",
        "ratioUnlocked": "Free ratio (click to lock)"
      }
    },
    "ja": {
      "image": {
        "suffixCrop": "切り抜き",
        "hintCrop": "複数枚まとめて追加できます。切り抜き枠をドラッグして範囲を選択します。比率の固定や、ピクセル・パーセントでのサイズ変更もできます",
        "crop": "切り抜き",
        "cropViewHint": "ホイールで拡大縮小、空いた所をドラッグで移動",
        "cropResetTitle": "画像全体・元のサイズに戻す",
        "cropDownloadAll": "すべてダウンロード（{n} 枚）",
        "cropZipName": "切り抜いた画像",
        "resize": "サイズ変更",
        "width": "幅",
        "height": "高さ",
        "ratioLocked": "縦横比を固定（クリックで解除）",
        "ratioUnlocked": "縦横比を固定しない（クリックで固定）"
      }
    }
  }
});
