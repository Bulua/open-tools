import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "jwt": {
        "name": "JWT Decoder",
        "desc": "Inspect a JWT's header, payload and expiry time"
      }
    },
    "ja": {
      "jwt": {
        "name": "JWT デコード",
        "desc": "JWT のヘッダー・ペイロード・有効期限を確認します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "encode": {
        "badJwtPart": "{name} 不是合法的 Base64URL 编码 JSON",
        "badJwt": "JWT 应由两个「.」分隔为三段",
        "unknown": "未知",
        "jwtPlaceholder": "粘贴 JWT，可以带 Bearer 前缀",
        "jwtHint": "在左侧粘贴 JWT 后，这里会显示解码内容和过期状态。",
        "summary": "概要",
        "noSignature": "仅解码内容，不校验签名",
        "status": "状态",
        "algorithm": "算法",
        "paren": "（{text}）"
      }
    },
    "en": {
      "encode": {
        "badJwtPart": "{name} is not valid Base64URL-encoded JSON",
        "badJwt": "A JWT should have three parts separated by two dots",
        "unknown": "Unknown",
        "jwtPlaceholder": "Paste a JWT (a Bearer prefix is fine)",
        "jwtHint": "Paste a JWT on the left to see its contents and expiry status here.",
        "summary": "Summary",
        "noSignature": "Decodes only; the signature is not verified",
        "status": "Status",
        "algorithm": "Algorithm",
        "paren": " ({text})"
      }
    },
    "ja": {
      "encode": {
        "badJwtPart": "{name} は有効な Base64URL エンコードの JSON ではありません",
        "badJwt": "JWT は 2 つの「.」で 3 つに区切られている必要があります",
        "unknown": "不明",
        "jwtPlaceholder": "JWT を貼り付け（Bearer 付きでも可）",
        "jwtHint": "左に JWT を貼り付けると、内容と有効期限の状態がここに表示されます。",
        "summary": "概要",
        "noSignature": "内容をデコードするだけで、署名は検証しません",
        "status": "状態",
        "algorithm": "アルゴリズム",
        "paren": "（{text}）"
      }
    }
  }
});
