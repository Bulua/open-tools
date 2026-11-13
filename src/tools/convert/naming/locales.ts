import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "naming": {
        "name": "Naming Case Converter",
        "desc": "Convert identifiers between camelCase, snake_case, kebab-case, CONSTANT_CASE and more"
      }
    },
    "ja": {
      "naming": {
        "name": "命名規則変換",
        "desc": "変数名をキャメルケース・スネークケース・ケバブケース・定数形式などに変換"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "convert": {
        "original": "原文",
        "namingPlaceholder": "输入变量名，例如 user_name 或 userName；多行会逐行转换"
      }
    },
    "en": {
      "convert": {
        "original": "Original",
        "namingPlaceholder": "Type identifiers, e.g. user_name or userName; each line is converted separately"
      }
    },
    "ja": {
      "convert": {
        "original": "元の名前",
        "namingPlaceholder": "変数名を入力（例：user_name、userName）。複数行は 1 行ずつ変換します"
      }
    }
  }
});
