import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "calculator": {
        "name": "Calculator",
        "desc": "Type an expression for instant results, with parentheses, powers, roots, trigonometry and history"
      }
    },
    "ja": {
      "calculator": {
        "name": "電卓",
        "desc": "式を入力するとすぐに計算。括弧・べき乗・平方根・三角関数・履歴に対応"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "utility": {
        "badNumber": "数字格式不正确",
        "unknownName": "不认识「{name}」",
        "unknownSymbol": "不认识的符号「{ch}」",
        "factorial": "阶乘只能用于非负整数",
        "needExpr": "请输入算式",
        "divZero": "不能除以 0",
        "incomplete": "算式不完整",
        "negSqrt": "负数不能开平方",
        "parenMismatch": "括号不匹配",
        "extraContent": "算式有多余的内容",
        "invalidResult": "无效结果",
        "angleUnit": "三角函数使用的角度单位",
        "deg": "角度 DEG",
        "rad": "弧度 RAD",
        "exprPlaceholder": "输入算式，例如 (12+8)×3",
        "history": "历史记录",
        "clearHistory": "清空历史",
        "useExpr": "使用这个算式",
        "useResult": "使用这个结果（右键复制）",
        "historyEmpty": "按回车或「=」后，算式会记录在这里。点算式可以重新编辑，点结果可以插入到当前算式，右键结果可以复制。"
      }
    },
    "en": {
      "utility": {
        "badNumber": "Invalid number",
        "unknownName": "Unknown “{name}”",
        "unknownSymbol": "Unknown symbol “{ch}”",
        "factorial": "Factorial only works on non-negative integers",
        "needExpr": "Enter an expression",
        "divZero": "Can't divide by 0",
        "incomplete": "Incomplete expression",
        "negSqrt": "Can't take the square root of a negative number",
        "parenMismatch": "Mismatched parentheses",
        "extraContent": "Unexpected extra input",
        "invalidResult": "Invalid result",
        "angleUnit": "Angle unit for trigonometric functions",
        "deg": "Degrees DEG",
        "rad": "Radians RAD",
        "exprPlaceholder": "Enter an expression, e.g. (12+8)×3",
        "history": "History",
        "clearHistory": "Clear history",
        "useExpr": "Use this expression",
        "useResult": "Use this result (right-click to copy)",
        "historyEmpty": "Expressions are recorded here when you press Enter or “=”. Click an expression to edit it again, click a result to insert it, right-click a result to copy it."
      }
    },
    "ja": {
      "utility": {
        "badNumber": "数値の形式が正しくありません",
        "unknownName": "「{name}」は認識できません",
        "unknownSymbol": "認識できない記号「{ch}」",
        "factorial": "階乗は 0 以上の整数にのみ使えます",
        "needExpr": "式を入力してください",
        "divZero": "0 で割ることはできません",
        "incomplete": "式が不完全です",
        "negSqrt": "負の数の平方根は計算できません",
        "parenMismatch": "括弧が対応していません",
        "extraContent": "式に余分な内容があります",
        "invalidResult": "無効な結果",
        "angleUnit": "三角関数で使う角度の単位",
        "deg": "度 DEG",
        "rad": "ラジアン RAD",
        "exprPlaceholder": "式を入力（例：(12+8)×3）",
        "history": "履歴",
        "clearHistory": "履歴をクリア",
        "useExpr": "この式を使う",
        "useResult": "この結果を使う（右クリックでコピー）",
        "historyEmpty": "Enter または「=」を押すと式がここに記録されます。式をクリックで再編集、結果をクリックで現在の式に挿入、結果を右クリックでコピーできます。"
      }
    }
  }
});
