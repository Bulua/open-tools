import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "base64": {
        "name": "Base64 Encode / Decode",
        "desc": "Convert text, images or any file to and from Base64; download decoded results"
      }
    },
    "ja": {
      "base64": {
        "name": "Base64 エンコード / デコード",
        "desc": "テキスト・画像・任意のファイルと Base64 を相互変換し、デコード結果をダウンロードできます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "encode": {
        "badBase64Chars": "包含 Base64 以外的字符",
        "badLength": "长度不正确",
        "notText": "解码结果不是文本，可能是文件或图片",
        "pureBase64": "纯 Base64",
        "fileImage": "文件 / 图片",
        "readFailed": "读取文件失败",
        "type": "类型",
        "dimensions": "尺寸",
        "fileSize": "文件大小",
        "base64Length": "Base64 长度",
        "chars": "{n} 字符",
        "unknownBinary": "未知（二进制文件）",
        "fileToBase64": "文件 → Base64",
        "base64ToFile": "Base64 → 文件",
        "replaceFile": "更换文件",
        "preview": "预览",
        "dropFileHint": "支持图片、PDF、压缩包等任意文件，也可以按 Ctrl + V 粘贴截图",
        "encodePlaceholder": "选择文件后，这里会显示编码结果",
        "decodePlaceholder": "粘贴 Base64 或 Data URI（data:image/png;base64,...）",
        "decodeResult": "解码结果",
        "noPreview": "无法预览此类型，可以下载后打开",
        "fileName": "文件名",
        "saved": "已保存",
        "download": "下载",
        "decodeFailed": "解码失败：{error}",
        "decodeHint": "在左侧粘贴内容后，这里会显示解码出的文件，可以预览和下载。",
        "urlSafeTitle": "+ / 替换为 - _，并去掉末尾的 =，适合放在 URL 中",
        "urlSafe": "URL 安全",
        "textPlaceholder": "输入文本，右侧实时显示 Base64",
        "base64Placeholder": "或在这里粘贴 Base64，左侧实时解码"
      }
    },
    "en": {
      "encode": {
        "badBase64Chars": "Contains characters that aren't Base64",
        "badLength": "Incorrect length",
        "notText": "The decoded result isn't text — it may be a file or an image",
        "pureBase64": "Plain Base64",
        "fileImage": "File / Image",
        "readFailed": "Couldn't read the file",
        "type": "Type",
        "dimensions": "Dimensions",
        "fileSize": "File size",
        "base64Length": "Base64 length",
        "chars": "{n} characters",
        "unknownBinary": "Unknown (binary file)",
        "fileToBase64": "File → Base64",
        "base64ToFile": "Base64 → File",
        "replaceFile": "Choose another file",
        "preview": "Preview",
        "dropFileHint": "Any file works — images, PDFs, archives… You can also paste a screenshot with Ctrl + V",
        "encodePlaceholder": "The encoded result appears here after you choose a file",
        "decodePlaceholder": "Paste Base64 or a Data URI (data:image/png;base64,...)",
        "decodeResult": "Decoded result",
        "noPreview": "This type can't be previewed — download it to open",
        "fileName": "File name",
        "saved": "Saved",
        "download": "Download",
        "decodeFailed": "Decoding failed: {error}",
        "decodeHint": "Paste content on the left to see the decoded file here, ready to preview and download.",
        "urlSafeTitle": "Replace + / with - _ and drop trailing =, suitable for URLs",
        "urlSafe": "URL-safe",
        "textPlaceholder": "Type text; Base64 appears on the right as you type",
        "base64Placeholder": "Or paste Base64 here to decode it on the left"
      }
    },
    "ja": {
      "encode": {
        "badBase64Chars": "Base64 以外の文字が含まれています",
        "badLength": "長さが正しくありません",
        "notText": "デコード結果はテキストではありません。ファイルや画像の可能性があります",
        "pureBase64": "Base64 のみ",
        "fileImage": "ファイル / 画像",
        "readFailed": "ファイルを読み込めませんでした",
        "type": "種類",
        "dimensions": "サイズ",
        "fileSize": "ファイルサイズ",
        "base64Length": "Base64 の長さ",
        "chars": "{n} 文字",
        "unknownBinary": "不明（バイナリファイル）",
        "fileToBase64": "ファイル → Base64",
        "base64ToFile": "Base64 → ファイル",
        "replaceFile": "別のファイルを選択",
        "preview": "プレビュー",
        "dropFileHint": "画像・PDF・圧縮ファイルなど何でも対応。Ctrl + V でスクリーンショットも貼り付けられます",
        "encodePlaceholder": "ファイルを選ぶと、ここにエンコード結果が表示されます",
        "decodePlaceholder": "Base64 または Data URI（data:image/png;base64,...）を貼り付け",
        "decodeResult": "デコード結果",
        "noPreview": "この形式はプレビューできません。ダウンロードして開いてください",
        "fileName": "ファイル名",
        "saved": "保存しました",
        "download": "ダウンロード",
        "decodeFailed": "デコードに失敗しました：{error}",
        "decodeHint": "左に内容を貼り付けると、デコードされたファイルがここに表示され、プレビューやダウンロードができます。",
        "urlSafeTitle": "+ / を - _ に置き換え、末尾の = を取り除きます（URL 向け）",
        "urlSafe": "URL セーフ",
        "textPlaceholder": "テキストを入力すると、右に Base64 がリアルタイムで表示されます",
        "base64Placeholder": "または Base64 をここに貼り付けると、左にデコード結果が表示されます"
      }
    }
  }
});
