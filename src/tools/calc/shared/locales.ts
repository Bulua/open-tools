import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  messages: {
    "zh-CN": {
      convert: {
        enterNumber: "请输入数字",
        result: "结果",
      },
      utility: {
        kLog: "以 10 为底的对数",
        kPow: "乘方",
        kFact: "阶乘",
        kClear: "清空（Esc）",
        kBack: "退格",
        kPercent: "百分号：50% = 0.5",
        kSquare: "平方",
        kEquals: "计算（回车）",
      },
    },
    en: {
      convert: {
        enterNumber: "Enter a number",
        result: "Result",
      },
      utility: {
        kLog: "Base-10 logarithm",
        kPow: "Power",
        kFact: "Factorial",
        kClear: "Clear (Esc)",
        kBack: "Backspace",
        kPercent: "Percent: 50% = 0.5",
        kSquare: "Square",
        kEquals: "Calculate (Enter)",
      },
    },
    ja: {
      convert: {
        enterNumber: "数値を入力してください",
        result: "結果",
      },
      utility: {
        kLog: "常用対数（底 10）",
        kPow: "べき乗",
        kFact: "階乗",
        kClear: "クリア（Esc）",
        kBack: "1 文字削除",
        kPercent: "パーセント：50% = 0.5",
        kSquare: "2 乗",
        kEquals: "計算（Enter）",
      },
    },
  },
});
