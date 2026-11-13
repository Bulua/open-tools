import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "cron": {
        "name": "Cron Expression",
        "desc": "Explain or build a cron expression field by field and list its next run times; supports Linux / Spring / Quartz"
      }
    },
    "ja": {
      "cron": {
        "name": "Cron 式",
        "desc": "Cron 式を解析・項目ごとに作成し、意味と次回の実行時刻を表示します。Linux / Spring / Quartz に対応"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "utility": {
        "badPart": "{label}「{part}」写法不正确",
        "badStep": "{label}「{part}」的间隔必须大于 0",
        "partRange": "{label}「{part}」超出范围 {min}～{max}",
        "partOrder": "{label}「{part}」的起始值不能大于结束值",
        "badValue": "{label}「{s}」不是有效的值",
        "needCron": "请输入 Cron 表达式",
        "badMacro": "不支持「{expr}」，可以使用 {'@'}yearly {'@'}monthly {'@'}weekly {'@'}daily {'@'}hourly",
        "fieldCount": "{dialect} 格式需要 {expected} 位（{fields}），当前是 {n} 位",
        "or": " 或 ",
        "weekRange": "周「{s}」超出范围 {range}",
        "quartzQ": "Quartz 格式中，日和周必须有一个写 ?",
        "format": "表达式格式",
        "auto": "自动识别",
        "cronPlaceholder": "例如 */5 * * * *",
        "copyExpr": "复制表达式",
        "detected": "识别为 {dialect}",
        "cronB": {
          "title": "按字段生成",
          "every": {
            "second": "每秒",
            "minute": "每分钟",
            "hour": "每小时",
            "day": "每天",
            "month": "每月",
            "week": "不限星期",
            "year": "每年"
          },
          "none": {
            "day": "不指定日期（?），按星期执行",
            "week": "不指定星期（?），按日期执行"
          },
          "step": "从 {start} 开始，每 {step} {unit}",
          "unit": {
            "second": "秒",
            "minute": "分钟",
            "hour": "小时",
            "day": "天",
            "month": "个月",
            "week": "天",
            "year": "年"
          },
          "range": "从 {from} 到 {to}",
          "list": "指定",
          "lastDay": "每月最后一天，往前推 {offset} 天",
          "lastWeekday": "每月最后一个工作日",
          "nearest": "离 {day} 日最近的工作日",
          "nth": "每月第 {nth} 个 {weekday}",
          "ord": {
            "1": "1",
            "2": "2",
            "3": "3",
            "4": "4",
            "5": "5"
          },
          "lastWeek": "每月最后一个 {weekday}",
          "custom": "手写的写法，选上面任一项即可替换"
        },
        "nextRuns": "接下来的执行时间",
        "noRuns": "未来 5 年内没有匹配的时间",
        "badExpr": "表达式有误，无法计算"
      }
    },
    "en": {
      "utility": {
        "badPart": "{label} “{part}” is invalid",
        "badStep": "{label} “{part}”: the step must be greater than 0",
        "partRange": "{label} “{part}” is out of range {min}–{max}",
        "partOrder": "{label} “{part}”: the start can't be greater than the end",
        "badValue": "{label} “{s}” is not a valid value",
        "needCron": "Enter a cron expression",
        "badMacro": "“{expr}” isn't supported; use {'@'}yearly {'@'}monthly {'@'}weekly {'@'}daily {'@'}hourly",
        "fieldCount": "{dialect} format needs {expected} fields ({fields}); got {n}",
        "or": " or ",
        "weekRange": "Weekday “{s}” is out of range {range}",
        "quartzQ": "In Quartz format, either day or weekday must be ?",
        "format": "Expression format",
        "auto": "Auto",
        "cronPlaceholder": "e.g. */5 * * * *",
        "copyExpr": "Copy expression",
        "detected": "Detected as {dialect}",
        "cronB": {
          "title": "Build by field",
          "every": {
            "second": "Every second",
            "minute": "Every minute",
            "hour": "Every hour",
            "day": "Every day",
            "month": "Every month",
            "week": "Any weekday",
            "year": "Every year"
          },
          "none": {
            "day": "No specific day (?), use weekday",
            "week": "No specific weekday (?), use day"
          },
          "step": "Every {step} {unit} starting at {start}",
          "unit": {
            "second": "seconds",
            "minute": "minutes",
            "hour": "hours",
            "day": "days",
            "month": "months",
            "week": "days",
            "year": "years"
          },
          "range": "From {from} to {to}",
          "list": "Specific values",
          "lastDay": "Last day of the month, minus {offset} days",
          "lastWeekday": "Last weekday of the month",
          "nearest": "Weekday nearest to day {day}",
          "nth": "The {nth} {weekday} of the month",
          "ord": {
            "1": "1st",
            "2": "2nd",
            "3": "3rd",
            "4": "4th",
            "5": "5th"
          },
          "lastWeek": "The last {weekday} of the month",
          "custom": "Custom value; pick any option above to replace it"
        },
        "nextRuns": "Next runs",
        "noRuns": "No matching time in the next 5 years",
        "badExpr": "Invalid expression"
      }
    },
    "ja": {
      "utility": {
        "badPart": "{label}「{part}」の書き方が正しくありません",
        "badStep": "{label}「{part}」の間隔は 0 より大きくしてください",
        "partRange": "{label}「{part}」が範囲 {min}～{max} を超えています",
        "partOrder": "{label}「{part}」の開始値が終了値より大きくなっています",
        "badValue": "{label}「{s}」は有効な値ではありません",
        "needCron": "Cron 式を入力してください",
        "badMacro": "「{expr}」には対応していません。{'@'}yearly {'@'}monthly {'@'}weekly {'@'}daily {'@'}hourly が使えます",
        "fieldCount": "{dialect} 形式は {expected} 項目（{fields}）が必要ですが、現在は {n} 項目です",
        "or": " または ",
        "weekRange": "曜日「{s}」が範囲 {range} を超えています",
        "quartzQ": "Quartz 形式では、日と曜日のどちらかを ? にする必要があります",
        "format": "式の形式",
        "auto": "自動判別",
        "cronPlaceholder": "例：*/5 * * * *",
        "copyExpr": "式をコピー",
        "detected": "{dialect} と判別",
        "cronB": {
          "title": "項目ごとに作成",
          "every": {
            "second": "毎秒",
            "minute": "毎分",
            "hour": "毎時",
            "day": "毎日",
            "month": "毎月",
            "week": "曜日を限定しない",
            "year": "毎年"
          },
          "none": {
            "day": "日を指定しない（?）、曜日で実行",
            "week": "曜日を指定しない（?）、日で実行"
          },
          "step": "{start} から {step} {unit}ごと",
          "unit": {
            "second": "秒",
            "minute": "分",
            "hour": "時間",
            "day": "日",
            "month": "か月",
            "week": "日",
            "year": "年"
          },
          "range": "{from} から {to} まで",
          "list": "指定",
          "lastDay": "月の最終日の {offset} 日前",
          "lastWeekday": "月の最終平日",
          "nearest": "{day} 日に最も近い平日",
          "nth": "毎月第 {nth} {weekday}",
          "ord": {
            "1": "1",
            "2": "2",
            "3": "3",
            "4": "4",
            "5": "5"
          },
          "lastWeek": "毎月最後の {weekday}",
          "custom": "手書きの値です。上のいずれかを選ぶと置き換わります"
        },
        "nextRuns": "次回以降の実行時刻",
        "noRuns": "今後 5 年以内に一致する時刻はありません",
        "badExpr": "式が正しくないため計算できません"
      }
    }
  }
});
