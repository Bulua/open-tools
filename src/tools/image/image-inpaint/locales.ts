import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "image-inpaint": {
        "name": "Watermark Remover",
        "desc": "Brush or box over watermarks, text or objects and AI fills in the background; large images stay sharp"
      }
    },
    "ja": {
      "image-inpaint": {
        "name": "画像の透かし除去",
        "desc": "透かしや文字、不要な物を塗るか囲むと、AI が背景を自然に補完します。大きな画像も鮮明なまま"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "image": {
        "inpaintModel": "修补模型",
        "inpaintNoModel": "先下载一个模型，再涂抹要去掉的水印",
        "inpaintSelect": "选择水印",
        "inpaintBrushHint": "涂抹水印，松开后自动去除；滚轮缩放，右键拖动",
        "inpaintRectHint": "框选水印，松开后自动去除；滚轮缩放，右键拖动",
        "inpainting": "正在去除…",
        "inpaintFailed": "去除失败：{error}",
        "inpaintDone": "已去除 {n} 处，导出为原格式（{format}）",
        "inpaintEmpty": "放入图片后，涂抹或框选要去掉的水印",
        "inpaintDropHint": "涂抹或框选水印、文字、杂物，AI 自动补全背景；也可以按 Ctrl + V 粘贴",
        "inpaintSuffix": "去水印",
        "compare": "对比",
        "compareTitle": "按住查看原图"
      }
    },
    "en": {
      "image": {
        "inpaintModel": "Inpainting model",
        "inpaintNoModel": "Download a model first, then paint over the watermark",
        "inpaintSelect": "Mark the watermark",
        "inpaintBrushHint": "Paint over the watermark; it's removed when you release. Scroll to zoom, right-drag to pan",
        "inpaintRectHint": "Box the watermark; it's removed when you release. Scroll to zoom, right-drag to pan",
        "inpainting": "Removing…",
        "inpaintFailed": "Removal failed: {error}",
        "inpaintDone": "{n} areas removed; exported in the original format ({format})",
        "inpaintEmpty": "Add an image, then paint or box what to remove",
        "inpaintDropHint": "Paint or box watermarks, text or objects and AI fills in the background. You can also paste with Ctrl + V",
        "inpaintSuffix": "no-watermark",
        "compare": "Compare",
        "compareTitle": "Hold to see the original"
      }
    },
    "ja": {
      "image": {
        "inpaintModel": "補完モデル",
        "inpaintNoModel": "先にモデルをダウンロードしてから、消したい透かしを塗ってください",
        "inpaintSelect": "透かしを指定",
        "inpaintBrushHint": "透かしを塗り、離すと自動で除去します。ホイールで拡大縮小、右ドラッグで移動",
        "inpaintRectHint": "透かしを囲み、離すと自動で除去します。ホイールで拡大縮小、右ドラッグで移動",
        "inpainting": "除去しています…",
        "inpaintFailed": "除去に失敗しました：{error}",
        "inpaintDone": "{n} か所を除去しました。元の形式（{format}）で書き出します",
        "inpaintEmpty": "画像を追加して、消したい透かしを塗るか囲んでください",
        "inpaintDropHint": "透かしや文字、不要な物を塗るか囲むと、AI が背景を補完します。Ctrl + V で貼り付けもできます",
        "inpaintSuffix": "透かし除去",
        "compare": "比較",
        "compareTitle": "押している間、元の画像を表示"
      }
    }
  }
});
