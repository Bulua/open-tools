import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "messages": {
    "zh-CN": {
      "convert": {
        "enterNumber": "请输入数字",
        "result": "结果",
        "zoneNotFound": "没有找到「{q}」，可以输入城市名（如 纽约）或时区（如 America/New_York）"
      }
    },
    "en": {
      "convert": {
        "enterNumber": "Enter a number",
        "result": "Result",
        "zoneNotFound": "Couldn't find “{q}”. Enter a city (e.g. New York) or a time zone (e.g. America/New_York)"
      }
    },
    "ja": {
      "convert": {
        "enterNumber": "数値を入力してください",
        "result": "結果",
        "zoneNotFound": "「{q}」が見つかりません。都市名（例：ニューヨーク）またはタイムゾーン（例：America/New_York）を入力してください"
      }
    }
  }
});
