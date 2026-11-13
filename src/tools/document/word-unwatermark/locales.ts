import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "word-unwatermark": {
        "name": "Remove Word Watermark",
        "desc": "Find watermarks added by Word or WPS, plus homemade ones like WordArt or translucent images in headers, and remove the ones you check; batch processing"
      }
    },
    "ja": {
      "word-unwatermark": {
        "name": "Word の透かしを削除",
        "desc": "Word・WPS で追加された透かしや、ヘッダー内のワードアート・半透明画像などの自作の透かしを見つけ、チェックしたものを削除します。まとめて処理できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "document": {
        "wordWpsWatermark": "Word / WPS 添加的水印",
        "traitBehind": "衬于文字下方",
        "traitRotated": "旋转",
        "traitWordArt": "艺术字",
        "headerShape": "页眉中的浮动图形：{traits}",
        "headerShapeMaybe": "页眉中的浮动图形，可能是 Logo 或装饰",
        "bodyShape": "正文中的浮动图形：{traits}，请确认是否是水印",
        "textWatermark": "文字水印",
        "textBox": "文本框",
        "imageWatermark": "图片水印",
        "shape": "图形",
        "bgImage": "页面背景图片",
        "bgColor": "页面背景颜色",
        "bgImageReason": "「设计 → 页面颜色」设置的背景图片",
        "bgColorReason": "「设计 → 页面颜色」设置的背景色 #{color}",
        "wordUnwmZip": "Word 去水印.zip",
        "wordNoWatermark": "没有找到水印。如果文档里看得到水印，它可能是图片的一部分（例如扫描件、截图），这种无法去除。",
        "wordUnwmTip": "只删除勾选的水印，正文和格式不变。预览中可能显示不出 Word 水印，以下载后在 Word 中打开为准。",
        "previewAfterRemove": "预览（去除后）",
        "wordUnwmHint": "自动找出 Word、WPS 添加的水印，以及页眉里的艺术字、半透明图片等自制水印"
      }
    },
    "en": {
      "document": {
        "wordWpsWatermark": "Watermark added by Word / WPS",
        "traitBehind": "behind text",
        "traitRotated": "rotated",
        "traitWordArt": "WordArt",
        "headerShape": "Floating shape in the header: {traits}",
        "headerShapeMaybe": "Floating shape in the header — may be a logo or decoration",
        "bodyShape": "Floating shape in the body: {traits} — check whether it's a watermark",
        "textWatermark": "Text watermark",
        "textBox": "Text box",
        "imageWatermark": "Image watermark",
        "shape": "Shape",
        "bgImage": "Page background image",
        "bgColor": "Page background color",
        "bgImageReason": "Background image set in Design → Page Color",
        "bgColorReason": "Background color #{color} set in Design → Page Color",
        "wordUnwmZip": "Word without watermarks.zip",
        "wordNoWatermark": "No watermarks found. If you can see one, it may be part of an image (a scan or screenshot), which can't be removed.",
        "wordUnwmTip": "Only checked watermarks are removed; text and formatting stay the same. The preview may not show Word watermarks — check the downloaded file in Word.",
        "previewAfterRemove": "Preview (removed)",
        "wordUnwmHint": "Finds watermarks added by Word or WPS, plus homemade ones like WordArt or translucent images in headers"
      }
    },
    "ja": {
      "document": {
        "wordWpsWatermark": "Word / WPS で追加された透かし",
        "traitBehind": "背面",
        "traitRotated": "回転",
        "traitWordArt": "ワードアート",
        "headerShape": "ヘッダー内の浮動図形：{traits}",
        "headerShapeMaybe": "ヘッダー内の浮動図形（ロゴや装飾の可能性があります）",
        "bodyShape": "本文内の浮動図形：{traits}。透かしかどうか確認してください",
        "textWatermark": "文字の透かし",
        "textBox": "テキストボックス",
        "imageWatermark": "画像の透かし",
        "shape": "図形",
        "bgImage": "ページの背景画像",
        "bgColor": "ページの背景色",
        "bgImageReason": "「デザイン → ページの色」で設定された背景画像",
        "bgColorReason": "「デザイン → ページの色」で設定された背景色 #{color}",
        "wordUnwmZip": "透かしを除去した Word.zip",
        "wordNoWatermark": "透かしが見つかりません。文書内に透かしが見える場合、画像の一部になっている（スキャンやスクリーンショットなど）可能性があり、その場合は除去できません。",
        "wordUnwmTip": "チェックした透かしだけを削除し、本文と書式は変わりません。プレビューには Word の透かしが表示されないことがあるため、ダウンロード後に Word で開いて確認してください。",
        "previewAfterRemove": "プレビュー（除去後）",
        "wordUnwmHint": "Word・WPS で追加された透かしや、ヘッダー内のワードアート・半透明画像などの自作の透かしを自動で見つけます"
      }
    }
  }
});
