import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "timestamp": {
        "name": "Timestamp Converter",
        "desc": "Convert Unix timestamps (seconds / milliseconds) to and from dates, and see the current timestamp"
      }
    },
    "ja": {
      "timestamp": {
        "name": "タイムスタンプ変換",
        "desc": "Unix タイムスタンプ（秒 / ミリ秒）と日時を相互変換し、現在のタイムスタンプを表示します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "convert": {
        "outOfRange": "时间戳超出范围",
        "badTime": "无法识别，请输入时间戳或日期，例如 2024-01-02 03:04:05",
        "seconds": "秒",
        "milliseconds": "毫秒",
        "localTime": "本地时间",
        "parsedAsS": "按秒解析",
        "parsedAsMs": "按毫秒解析",
        "parsedAsDate": "按日期解析",
        "relative": "相对现在",
        "unitTitle": "输入数字时如何理解",
        "auto": "自动识别",
        "convert": "转换",
        "timePlaceholder": "时间戳（秒 / 毫秒）或日期，例如 2024-01-02 03:04:05",
        "now": "现在",
        "currentTime": "当前时间",
        "pause": "暂停",
        "resume": "继续"
      }
    },
    "en": {
      "convert": {
        "outOfRange": "Timestamp out of range",
        "badTime": "Not recognized. Enter a timestamp or a date, e.g. 2024-01-02 03:04:05",
        "seconds": "Seconds",
        "milliseconds": "Milliseconds",
        "localTime": "Local time",
        "parsedAsS": "Read as seconds",
        "parsedAsMs": "Read as milliseconds",
        "parsedAsDate": "Read as a date",
        "relative": "Relative to now",
        "unitTitle": "How numbers are read",
        "auto": "Auto",
        "convert": "Convert",
        "timePlaceholder": "Timestamp (seconds / ms) or a date, e.g. 2024-01-02 03:04:05",
        "now": "Now",
        "currentTime": "Current time",
        "pause": "Pause",
        "resume": "Resume"
      }
    },
    "ja": {
      "convert": {
        "outOfRange": "タイムスタンプが範囲外です",
        "badTime": "認識できません。タイムスタンプまたは日時を入力してください（例：2024-01-02 03:04:05）",
        "seconds": "秒",
        "milliseconds": "ミリ秒",
        "localTime": "ローカル時刻",
        "parsedAsS": "秒として解釈",
        "parsedAsMs": "ミリ秒として解釈",
        "parsedAsDate": "日時として解釈",
        "relative": "現在からの差",
        "unitTitle": "数値の解釈方法",
        "auto": "自動判別",
        "convert": "変換",
        "timePlaceholder": "タイムスタンプ（秒 / ミリ秒）または日時（例：2024-01-02 03:04:05）",
        "now": "現在",
        "currentTime": "現在時刻",
        "pause": "一時停止",
        "resume": "再開"
      }
    }
  }
});
