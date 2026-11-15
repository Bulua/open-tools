import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "word-watermark": {
        "name": "Add Watermark to Word",
        "desc": "Add text or image watermarks to .docx files, the same as Word's own watermarks; batch processing"
      }
    },
    "ja": {
      "word-watermark": {
        "name": "Word に透かしを追加",
        "desc": ".docx に文字または画像の透かしを追加します（Word 標準の透かしと同じ）。まとめて処理できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "document": {
        "defaultWatermark": "内部资料",
        "noSection": "文档结构异常：找不到分节信息",
        "needText": "请输入水印文字",
        "needImage": "请选择水印图片",
        "watermarkedSuffix": "水印",
        "presets": "内部资料/机密/严禁复制/样本/草稿",
        "auto": "自动",
        "watermarkZip": "水印文档.zip",
        "textWm": "文字水印",
        "imageWm": "图片水印",
        "wmText": "水印文字",
        "font": "字体",
        "color": "颜色",
        "bold": "粗体",
        "fontSize": "字号",
        "opacity": "透明度",
        "replaceImage": "更换图片",
        "chooseImage": "选择水印图片",
        "size": "大小",
        "washout": "冲蚀（变淡，不影响阅读正文）",
        "layout": "版式",
        "diagonal": "斜式",
        "horizontal": "水平",
        "tiled": "平铺",
        "replaceOld": "删除文档原有的水印",
        "processingShort": "处理中…",
        "downloadWatermarked": "下载加水印的文档",
        "layoutDiffers": "{name} · 预览排版与 Word 可能略有差异",
        "dropDocx": "拖入 Word 文档（.docx），或点击选择（可多选）",
        "addWmHint": "添加的是 Word 原生水印，每一页都有，之后可以在 Word 的「设计 → 水印」中修改或删除"
      }
    },
    "en": {
      "document": {
        "defaultWatermark": "CONFIDENTIAL",
        "noSection": "Unexpected document structure: no section properties found",
        "needText": "Enter the watermark text",
        "needImage": "Choose a watermark image",
        "watermarkedSuffix": "watermarked",
        "presets": "CONFIDENTIAL/INTERNAL/DO NOT COPY/SAMPLE/DRAFT",
        "auto": "Auto",
        "watermarkZip": "Watermarked documents.zip",
        "textWm": "Text",
        "imageWm": "Image",
        "wmText": "Watermark text",
        "font": "Font",
        "color": "Color",
        "bold": "Bold",
        "fontSize": "Font size",
        "opacity": "Opacity",
        "replaceImage": "Replace image",
        "chooseImage": "Choose a watermark image",
        "size": "Size",
        "washout": "Washout (faded, keeps the text readable)",
        "layout": "Layout",
        "diagonal": "Diagonal",
        "horizontal": "Horizontal",
        "tiled": "Tile",
        "replaceOld": "Remove existing watermarks",
        "processingShort": "Processing…",
        "downloadWatermarked": "Download watermarked document",
        "layoutDiffers": "{name} · the preview layout may differ slightly from Word",
        "dropDocx": "Drop Word documents (.docx) here, or click to choose (multiple allowed)",
        "addWmHint": "Adds a native Word watermark on every page; you can edit or remove it later in Word under Design → Watermark"
      }
    },
    "ja": {
      "document": {
        "defaultWatermark": "社外秘",
        "noSection": "文書の構造が正しくありません：セクション情報が見つかりません",
        "needText": "透かしの文字を入力してください",
        "needImage": "透かしの画像を選んでください",
        "watermarkedSuffix": "透かし",
        "presets": "社外秘/機密/複製禁止/サンプル/下書き",
        "auto": "自動",
        "watermarkZip": "透かし入り文書.zip",
        "textWm": "文字の透かし",
        "imageWm": "画像の透かし",
        "wmText": "透かしの文字",
        "font": "フォント",
        "color": "色",
        "bold": "太字",
        "fontSize": "文字サイズ",
        "opacity": "不透明度",
        "replaceImage": "画像を変更",
        "chooseImage": "透かしの画像を選択",
        "size": "大きさ",
        "washout": "淡色（本文を読みやすく保つ）",
        "layout": "レイアウト",
        "diagonal": "斜め",
        "horizontal": "水平",
        "tiled": "タイル配置",
        "replaceOld": "文書にある既存の透かしを削除",
        "processingShort": "処理中…",
        "downloadWatermarked": "透かしを入れた文書をダウンロード",
        "layoutDiffers": "{name} · プレビューのレイアウトは Word と少し異なる場合があります",
        "dropDocx": "Word 文書（.docx）をドロップ、またはクリックして選択（複数可）",
        "addWmHint": "Word 標準の透かしを全ページに追加します。あとで Word の「デザイン → 透かし」で変更・削除できます"
      }
    }
  }
});
