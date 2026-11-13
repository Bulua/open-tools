import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "word-to-pdf": {
        "name": "Word to PDF",
        "desc": "Convert with the Word / WPS installed on this computer so the layout matches the original; batch conversion"
      }
    },
    "ja": {
      "word-to-pdf": {
        "name": "Word → PDF",
        "desc": "この PC の Word / WPS で変換するため、レイアウトは元の文書と同じです。まとめて変換できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "document": {
        "wordToPdfZip": "Word 转 PDF.zip",
        "downloadPdf": "下载这个 PDF",
        "browserNoWord": "浏览器中无法调用 Word，请使用安装后的桌面版；也可以用下方的「打印为 PDF」。",
        "detectingOffice": "正在检测本机的 Office 软件…",
        "engineNote": "使用本机的 {engine} 转换，效果与在其中「另存为 PDF」相同。转换时会在后台打开文档，请稍候。",
        "noOffice": "没有找到 Microsoft Word、WPS 或 LibreOffice。安装其中之一即可一键转换，也可以用下方的「打印为 PDF」。",
        "toPdf": "转换为 PDF",
        "printTitle": "用系统打印功能，选择「Microsoft Print to PDF」或「另存为 PDF」",
        "printPdf": "打印为 PDF（当前文档）",
        "printTip": "打印方式由程序自行排版，复杂文档可能与 Word 略有差异，仅支持 .docx。",
        "wordToPdfHint": "支持 .docx、.doc、.rtf、.odt、.wps；调用本机安装的 Word 或 WPS 转换，排版与原文档一致",
        "noPreviewExt": ".{ext} 格式无法预览，可以直接转换"
      }
    },
    "en": {
      "document": {
        "wordToPdfZip": "Word to PDF.zip",
        "downloadPdf": "Download this PDF",
        "browserNoWord": "Word can't be used from the browser — use the installed desktop app, or “Print to PDF” below.",
        "detectingOffice": "Looking for Office apps on this computer…",
        "engineNote": "Converts with {engine} on this computer, the same as “Save as PDF” there. Documents open in the background, so please wait.",
        "noOffice": "Microsoft Word, WPS or LibreOffice wasn't found. Install one of them for one-click conversion, or use “Print to PDF” below.",
        "toPdf": "Convert to PDF",
        "printTitle": "Uses system printing — choose “Microsoft Print to PDF” or “Save as PDF”",
        "printPdf": "Print to PDF (current document)",
        "printTip": "Printing uses the app's own layout, so complex documents may differ slightly from Word; .docx only.",
        "wordToPdfHint": "Supports .docx, .doc, .rtf, .odt, .wps; converts with Word or WPS on this computer, keeping the original layout",
        "noPreviewExt": ".{ext} files can't be previewed but can be converted"
      }
    },
    "ja": {
      "document": {
        "wordToPdfZip": "Word から PDF.zip",
        "downloadPdf": "この PDF をダウンロード",
        "browserNoWord": "ブラウザでは Word を使えません。インストール版のデスクトップアプリを使うか、下の「PDF として印刷」を使ってください。",
        "detectingOffice": "この PC の Office ソフトを確認中…",
        "engineNote": "この PC の {engine} で変換します。そのアプリで「PDF として保存」した場合と同じ結果になります。変換時にバックグラウンドで文書を開くので、しばらくお待ちください。",
        "noOffice": "Microsoft Word・WPS・LibreOffice が見つかりません。いずれかをインストールすればワンクリックで変換できます。下の「PDF として印刷」も使えます。",
        "toPdf": "PDF に変換",
        "printTitle": "システムの印刷機能を使います。「Microsoft Print to PDF」または「PDF として保存」を選んでください",
        "printPdf": "PDF として印刷（現在の文書）",
        "printTip": "印刷ではアプリ独自のレイアウトを使うため、複雑な文書は Word と少し異なる場合があります。.docx のみ対応です。",
        "wordToPdfHint": ".docx・.doc・.rtf・.odt・.wps に対応。この PC の Word または WPS で変換し、レイアウトは元の文書と同じです",
        "noPreviewExt": ".{ext} 形式はプレビューできませんが、そのまま変換できます"
      }
    }
  }
});
