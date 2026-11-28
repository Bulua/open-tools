import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "hash": {
        "name": "Hash (MD5 / SHA)",
        "desc": "Compute MD5, SHA-1, SHA-256 and SHA-512 of text or files"
      }
    },
    "ja": {
      "hash": {
        "name": "ハッシュ計算（MD5 / SHA）",
        "desc": "テキストやファイルの MD5・SHA-1・SHA-256・SHA-512 を計算します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "encode": {
        "file": "文件",
        "uppercase": "大写",
        "hashPlaceholder": "输入要计算哈希的文本（按 UTF-8 计算）",
        "hashHint": "常用于校验下载的文件是否完整",
        "result": "结果",
        "computing": "计算中…"
      }
    },
    "en": {
      "encode": {
        "file": "File",
        "uppercase": "Uppercase",
        "hashPlaceholder": "Type the text to hash (as UTF-8)",
        "hashHint": "Commonly used to verify downloaded files",
        "result": "Result",
        "computing": "Computing…"
      }
    },
    "ja": {
      "encode": {
        "file": "ファイル",
        "uppercase": "大文字",
        "hashPlaceholder": "ハッシュを計算するテキストを入力（UTF-8 で計算）",
        "hashHint": "ダウンロードしたファイルが完全かどうかの確認によく使われます",
        "result": "結果",
        "computing": "計算中…"
      }
    }
  }
});
