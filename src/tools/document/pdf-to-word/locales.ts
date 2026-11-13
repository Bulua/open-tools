import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "pdf-to-word": {
        "name": "PDF to Word",
        "desc": "Turn PDFs into editable Word documents — uses Microsoft Word when installed, otherwise the built-in converter; batch conversion"
      }
    },
    "ja": {
      "pdf-to-word": {
        "name": "PDF → Word",
        "desc": "PDF を編集可能な Word 文書に変換します。Microsoft Word があれば Word で、なければ内蔵の変換を使います。まとめて変換できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "document": {
        "pageProgress": "第 {done} / {total} 页",
        "noText": "没有读到文字，可能是扫描件，只转换了图片",
        "someNoText": "{n} 页没有文字（可能是扫描页），只转换了图片",
        "wordConverting": "Word 正在转换…",
        "wordFallback": "Word 转换失败，已改用内置转换（{reason}）",
        "pdfPassword": "PDF 有密码保护，请先解除密码",
        "pdfToWordZip": "PDF 转 Word.zip",
        "downloadDocx": "下载这个 Word 文档",
        "builtin": "内置转换",
        "detectingWord": "正在检测本机的 Microsoft Word…",
        "wordNote": "调用本机的 Word 转换，表格、图片和排版还原得最好，效果与在 Word 里直接打开 PDF 相同。转换时会在后台打开文件，请稍候。",
        "builtinNote": "读出 PDF 里的文字、图片重新排版：保留字号、粗体、段落和标题，表格、多栏会变成普通段落。适合以文字为主的文档。",
        "noWord": "没有找到 Microsoft Word（2013 或更新版本），安装后可以更好地还原表格和复杂排版。",
        "noWordBrowser": "浏览器中无法调用 Word，安装后可以更好地还原表格和复杂排版。",
        "toWord": "转换为 Word",
        "scanTip": "扫描版 PDF（整页是图片）没有文字，只能得到图片。",
        "pdfToWordHint": "转换为可编辑的 Word 文档（.docx）；装有 Microsoft Word 时调用 Word 转换，效果最好",
        "convertFailed": "转换失败",
        "previewAfter": "转换后在这里预览结果"
      }
    },
    "en": {
      "document": {
        "pageProgress": "Page {done} / {total}",
        "noText": "No text found — probably a scan, so only images were converted",
        "someNoText": "{n} pages have no text (probably scanned), so only images were converted",
        "wordConverting": "Word is converting…",
        "wordFallback": "Word conversion failed, used the built-in converter instead ({reason})",
        "pdfPassword": "The PDF is password-protected — remove the password first",
        "pdfToWordZip": "PDF to Word.zip",
        "downloadDocx": "Download this Word document",
        "builtin": "Built-in",
        "detectingWord": "Looking for Microsoft Word on this computer…",
        "wordNote": "Converts with Word on this computer — the best result for tables, images and layout, the same as opening the PDF in Word. Files open in the background, so please wait.",
        "builtinNote": "Rebuilds the text and images from the PDF, keeping font sizes, bold, paragraphs and headings; tables and columns become plain paragraphs. Best for text-heavy documents.",
        "noWord": "Microsoft Word (2013 or later) wasn't found; installing it gives better results for tables and complex layouts.",
        "noWordBrowser": "Word can't be used from the browser; the desktop app with Word gives better results for tables and complex layouts.",
        "toWord": "Convert to Word",
        "scanTip": "Scanned PDFs (whole pages as images) have no text, so you'll only get images.",
        "pdfToWordHint": "Converts to editable Word documents (.docx); uses Microsoft Word when installed for the best result",
        "convertFailed": "Conversion failed",
        "previewAfter": "The result is previewed here after conversion"
      }
    },
    "ja": {
      "document": {
        "pageProgress": "{done} / {total} ページ",
        "noText": "テキストが読み取れませんでした。スキャン文書の可能性があるため、画像のみ変換しました",
        "someNoText": "{n} ページにテキストがありません（スキャンしたページの可能性があります）。画像のみ変換しました",
        "wordConverting": "Word で変換中…",
        "wordFallback": "Word での変換に失敗したため、内蔵の変換を使いました（{reason}）",
        "pdfPassword": "PDF はパスワードで保護されています。先にパスワードを解除してください",
        "pdfToWordZip": "PDF から Word.zip",
        "downloadDocx": "この Word 文書をダウンロード",
        "builtin": "内蔵の変換",
        "detectingWord": "この PC の Microsoft Word を確認中…",
        "wordNote": "この PC の Word で変換します。表・画像・レイアウトの再現性が最も高く、Word で PDF を直接開いた場合と同じ結果になります。変換時にバックグラウンドでファイルを開くので、しばらくお待ちください。",
        "builtinNote": "PDF のテキストと画像を読み取って組み直します。文字サイズ・太字・段落・見出しは保持しますが、表や段組みは通常の段落になります。テキスト中心の文書に向いています。",
        "noWord": "Microsoft Word（2013 以降）が見つかりません。インストールすると表や複雑なレイアウトをよりきれいに再現できます。",
        "noWordBrowser": "ブラウザでは Word を使えません。Word のある環境でデスクトップ版を使うと、表や複雑なレイアウトをよりきれいに再現できます。",
        "toWord": "Word に変換",
        "scanTip": "スキャンした PDF（ページ全体が画像）にはテキストがないため、画像しか得られません。",
        "pdfToWordHint": "編集できる Word 文書（.docx）に変換します。Microsoft Word があれば Word で変換し、最もきれいに仕上がります",
        "convertFailed": "変換に失敗しました",
        "previewAfter": "変換後にここで結果をプレビューできます"
      }
    }
  }
});
