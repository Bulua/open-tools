import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "text-escape": {
        "name": "URL / Unicode / HTML Encode",
        "desc": "URL-encode parameters, convert text to \\uXXXX, escape HTML characters — live, both ways"
      }
    },
    "ja": {
      "text-escape": {
        "name": "URL / Unicode / HTML エンコード",
        "desc": "URL エンコード、文字の \\uXXXX 変換、HTML 特殊文字のエスケープを双方向にリアルタイム変換"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "encode": {
        "badUrl": "不是合法的 URL 编码",
        "original": "原文",
        "originalPlaceholder": "输入原文，右侧实时编码",
        "encodedPlaceholder": "或粘贴编码后的内容，左侧实时还原，例如 {example}"
      }
    },
    "en": {
      "encode": {
        "badUrl": "Not valid URL encoding",
        "original": "Original",
        "originalPlaceholder": "Type the original text; it's encoded on the right as you type",
        "encodedPlaceholder": "Or paste encoded content to decode it on the left, e.g. {example}"
      }
    },
    "ja": {
      "encode": {
        "badUrl": "有効な URL エンコードではありません",
        "original": "元のテキスト",
        "originalPlaceholder": "元のテキストを入力すると、右でリアルタイムにエンコードされます",
        "encodedPlaceholder": "またはエンコード済みの内容を貼り付けると左で元に戻します（例：{example}）"
      }
    }
  }
});
