import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "json-escape": {
        "name": "JSON String Escape",
        "desc": "Restore escaped JSON from logs (like {\\\"a\\\":1}), or escape it the other way",
        "placeholder": "e.g. {\\\"name\\\":\\\"Open Tools\\\"}",
        "actions": [
          "Unescape",
          "Escape"
        ]
      }
    },
    "ja": {
      "json-escape": {
        "name": "JSON 文字列エスケープ",
        "desc": "ログ内の {\\\"a\\\":1} のようにエスケープされた JSON を元に戻す、またはエスケープします",
        "placeholder": "例：{\\\"name\\\":\\\"Open Tools\\\"}",
        "actions": [
          "アンエスケープ",
          "エスケープ"
        ]
      }
    }
  }
});
