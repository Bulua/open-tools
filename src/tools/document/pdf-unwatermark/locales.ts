import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "pdf-unwatermark": {
        "name": "Remove PDF Watermark",
        "desc": "Find watermarks added by Acrobat, WPS and others, plus diagonal, translucent or repeated text and image watermarks, and remove the ones you check; batch processing"
      }
    },
    "ja": {
      "pdf-unwatermark": {
        "name": "PDF の透かしを削除",
        "desc": "Acrobat・WPS などで追加された透かしや、斜め・半透明・全ページに繰り返される文字や画像の透かしを見つけ、チェックしたものを削除します。まとめて処理できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "document": {
        "wmLayer": "位于水印图层",
        "wmAnnot": "水印注释",
        "allPages": "全部 {n} 页",
        "nPages": "{n} 页",
        "pdfRotated": "斜着",
        "pdfLight": "浅色",
        "pdfLarge": "大字",
        "imageWith": "{traits}的图片",
        "imageEveryPage": "每页都有的图片，可能是 Logo 或页眉",
        "processing": "正在处理…",
        "checkToProcess": "请勾选要处理的文件",
        "pdfUnwmZip": "PDF 去水印.zip",
        "pagesMany": "第 {first} 页等 {n} 页",
        "pagesList": "第 {list} 页",
        "listSep": "、",
        "findingWatermarks": "正在查找水印…",
        "pdfNoWatermark": "没有找到水印。如果页面上看得到水印，它可能和内容合成在同一张图片里（例如扫描件），这种无法去除。",
        "pdfUnwmTip": "只删除勾选的水印，正文仍可选择、复制。请只处理自己的文件或有权修改的文件。",
        "before": "原文件",
        "after": "去除后",
        "updating": "正在更新…",
        "prevPage": "上一页",
        "nextPage": "下一页",
        "pdfUnwmHint": "自动找出 Acrobat、WPS 等工具添加的水印，以及斜着、半透明、每页重复的文字和图片水印",
        "cantPreview": "无法预览"
      }
    },
    "en": {
      "document": {
        "wmLayer": "On a watermark layer",
        "wmAnnot": "Watermark annotation",
        "allPages": "all {n} pages",
        "nPages": "{n} pages",
        "pdfRotated": "diagonal",
        "pdfLight": "light",
        "pdfLarge": "large",
        "imageWith": "Image: {traits}",
        "imageEveryPage": "Image on every page — may be a logo or header",
        "processing": "Processing…",
        "checkToProcess": "Check the files to process",
        "pdfUnwmZip": "PDF without watermarks.zip",
        "pagesMany": "Page {first} and {n} more",
        "pagesList": "Page {list}",
        "listSep": ", ",
        "findingWatermarks": "Looking for watermarks…",
        "pdfNoWatermark": "No watermarks found. If you can see one, it may be merged into an image with the content (as in scans), which can't be removed.",
        "pdfUnwmTip": "Only checked watermarks are removed; text stays selectable. Only process files that are yours or that you may modify.",
        "before": "Original",
        "after": "Removed",
        "updating": "Updating…",
        "prevPage": "Previous page",
        "nextPage": "Next page",
        "pdfUnwmHint": "Finds watermarks added by Acrobat, WPS and others, plus diagonal, translucent or repeated text and image watermarks",
        "cantPreview": "Can't preview"
      }
    },
    "ja": {
      "document": {
        "wmLayer": "透かしレイヤー上にあります",
        "wmAnnot": "透かし注釈",
        "allPages": "全 {n} ページ",
        "nPages": "{n} ページ",
        "pdfRotated": "斜め",
        "pdfLight": "淡色",
        "pdfLarge": "大きな文字",
        "imageWith": "{traits}の画像",
        "imageEveryPage": "全ページにある画像（ロゴやヘッダーの可能性があります）",
        "processing": "処理中…",
        "checkToProcess": "処理するファイルをチェックしてください",
        "pdfUnwmZip": "透かしを除去した PDF.zip",
        "pagesMany": "{first} ページ目など {n} ページ",
        "pagesList": "{list} ページ目",
        "listSep": "、",
        "findingWatermarks": "透かしを検索中…",
        "pdfNoWatermark": "透かしが見つかりません。ページ上に透かしが見える場合、内容と一緒に 1 枚の画像になっている（スキャン文書など）可能性があり、その場合は除去できません。",
        "pdfUnwmTip": "チェックした透かしだけを削除し、本文は引き続き選択・コピーできます。自分のファイルか、変更する権利のあるファイルだけを処理してください。",
        "before": "元のファイル",
        "after": "除去後",
        "updating": "更新中…",
        "prevPage": "前のページ",
        "nextPage": "次のページ",
        "pdfUnwmHint": "Acrobat・WPS などで追加された透かしや、斜め・半透明・全ページに繰り返される文字や画像の透かしを自動で見つけます",
        "cantPreview": "プレビューできません"
      }
    }
  }
});
