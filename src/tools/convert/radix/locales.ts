import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "radix": {
        "name": "Number Base Converter",
        "desc": "Convert between binary, octal, decimal, hexadecimal and any other base"
      }
    },
    "ja": {
      "radix": {
        "name": "進数変換",
        "desc": "2 進数・8 進数・10 進数・16 進数・任意の進数を相互変換"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "convert": {
        "badDigit": "「{ch}」不是 {base} 进制的数字",
        "baseN": "{n} 进制",
        "binary": "二进制",
        "octal": "八进制",
        "decimal": "十进制",
        "hex": "十六进制",
        "bitLength": "{n} 位二进制，二进制分组：{groups}",
        "value": "数值",
        "radixHint": "修改任意一行，其他进制自动换算",
        "chooseBase": "选择进制",
        "copy": "复制"
      }
    },
    "en": {
      "convert": {
        "badDigit": "“{ch}” is not a base-{base} digit",
        "baseN": "Base {n}",
        "binary": "Binary",
        "octal": "Octal",
        "decimal": "Decimal",
        "hex": "Hexadecimal",
        "bitLength": "{n} bits, grouped: {groups}",
        "value": "Value",
        "radixHint": "Edit any row and the others update automatically",
        "chooseBase": "Choose a base",
        "copy": "Copy"
      }
    },
    "ja": {
      "convert": {
        "badDigit": "「{ch}」は {base} 進数の数字ではありません",
        "baseN": "{n} 進数",
        "binary": "2 進数",
        "octal": "8 進数",
        "decimal": "10 進数",
        "hex": "16 進数",
        "bitLength": "{n} ビット、4 桁区切り：{groups}",
        "value": "数値",
        "radixHint": "どの行を編集しても他の進数が自動で換算されます",
        "chooseBase": "進数を選択",
        "copy": "コピー"
      }
    }
  }
});
