import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "units": {
        "name": "Unit Converter",
        "desc": "Convert temperature, length, weight, area, volume, data, speed, time, pressure, energy, power, angle and frequency"
      }
    },
    "ja": {
      "units": {
        "name": "単位換算",
        "desc": "温度・長さ・重さ・面積・体積・データ量・速度・時間・圧力・エネルギー・電力・角度・周波数を換算"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "convert": {
        "input": "输入",
        "inputValue": "输入数值",
        "results": "换算结果",
        "equals": "{value} {unit} 等于",
        "category": "物理量",
        "sourceUnit": "源单位",
        "quickValues": "常用数值",
        "clearUnit": "清空",
        "unitCopied": "已复制"
      }
    },
    "en": {
      "convert": {
        "input": "Input",
        "inputValue": "Enter a value",
        "results": "Results",
        "equals": "{value} {unit} equals",
        "category": "Category",
        "sourceUnit": "From unit",
        "quickValues": "Quick values",
        "clearUnit": "Clear",
        "unitCopied": "Copied"
      }
    },
    "ja": {
      "convert": {
        "input": "入力",
        "inputValue": "数値を入力",
        "results": "換算結果",
        "equals": "{value} {unit} は",
        "category": "カテゴリー",
        "sourceUnit": "変換元の単位",
        "quickValues": "よく使う値",
        "clearUnit": "クリア",
        "unitCopied": "コピー済み"
      }
    }
  }
});
