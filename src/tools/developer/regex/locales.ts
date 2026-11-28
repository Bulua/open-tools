import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "regex": {
        "name": "Regex Tester",
        "desc": "Highlight matches live, inspect groups and preview replacements"
      }
    },
    "ja": {
      "regex": {
        "name": "正規表現テスト",
        "desc": "マッチ結果をリアルタイムにハイライトし、グループを確認、置換結果をプレビューします"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "utility": {
        "sampleText": "会议安排：2024-03-15 产品评审，2024-04-02 版本发布。\n联系人：tom{'@'}example.com，电话 13812345678",
        "enterRegex": "输入正则表达式开始匹配",
        "noMatch": "没有匹配",
        "matches": "{n} 处匹配",
        "unmatched": "（未匹配）",
        "empty": "（空）",
        "regexPlaceholder": "在这里输入正则表达式",
        "copyRegex": "复制正则",
        "syntaxError": "语法错误：{error}",
        "timeout": "匹配超过 {n} 秒已中止，这个表达式可能存在灾难性回溯（例如 (a+)+ 这类嵌套重复）",
        "testText": "测试文本",
        "testPlaceholder": "粘贴要匹配的文本",
        "running": "匹配中…",
        "matchResults": "匹配结果",
        "replace": "替换",
        "replaceHint": "可以用 $1、$<name> 引用分组",
        "replacePlaceholder": "替换为，例如 $<month>/$<day>/$<year>",
        "replaced": "替换结果"
      }
    },
    "en": {
      "utility": {
        "sampleText": "Schedule: 2024-03-15 product review, 2024-04-02 release.\nContact: tom{'@'}example.com, phone 13812345678",
        "enterRegex": "Enter a regular expression to start",
        "noMatch": "No matches",
        "matches": "{n} matches",
        "unmatched": "(unmatched)",
        "empty": "(empty)",
        "regexPlaceholder": "Enter a regular expression here",
        "copyRegex": "Copy regex",
        "syntaxError": "Syntax error: {error}",
        "timeout": "Stopped after {n} seconds — the expression may cause catastrophic backtracking (nested repeats like (a+)+)",
        "testText": "Test text",
        "testPlaceholder": "Paste the text to match",
        "running": "Matching…",
        "matchResults": "Matches",
        "replace": "Replace",
        "replaceHint": "Use $1 or $<name> to reference groups",
        "replacePlaceholder": "Replace with, e.g. $<month>/$<day>/$<year>",
        "replaced": "Result"
      }
    },
    "ja": {
      "utility": {
        "sampleText": "予定：2024-03-15 製品レビュー、2024-04-02 リリース。\n連絡先：tom{'@'}example.com、電話 13812345678",
        "enterRegex": "正規表現を入力するとマッチを開始します",
        "noMatch": "一致なし",
        "matches": "{n} 件一致",
        "unmatched": "（一致なし）",
        "empty": "（空）",
        "regexPlaceholder": "ここに正規表現を入力",
        "copyRegex": "正規表現をコピー",
        "syntaxError": "構文エラー：{error}",
        "timeout": "{n} 秒を超えたため中止しました。この式は破滅的バックトラック（例：(a+)+ のような入れ子の繰り返し）を起こしている可能性があります",
        "testText": "テスト文字列",
        "testPlaceholder": "マッチさせる文字列を貼り付け",
        "running": "マッチ中…",
        "matchResults": "マッチ結果",
        "replace": "置換",
        "replaceHint": "$1、$<name> でグループを参照できます",
        "replacePlaceholder": "置換後の文字列（例：$<month>/$<day>/$<year>）",
        "replaced": "置換結果"
      }
    }
  }
});
