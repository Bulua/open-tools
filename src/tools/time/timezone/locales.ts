import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "timezone": {
        "name": "Time Zones / World Clock",
        "desc": "Convert times between any time zones and view the current time in several cities side by side over 24 hours"
      }
    },
    "ja": {
      "timezone": {
        "name": "タイムゾーン / 世界時計",
        "desc": "任意のタイムゾーン間で時刻を換算し、複数都市の現在時刻を 24 時間で比較します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "convert": {
        "sameTime": "时间相同",
        "ahead": "早 {n} 小时",
        "behind": "晚 {n} 小时",
        "nextDay": "次日",
        "prevDay": "前一天",
        "commonCities": "常用城市",
        "allZones": "全部时区",
        "base": "基准",
        "baseZone": "基准时区",
        "setTime": "设置时间（按基准时区）",
        "showingNow": "正在显示当前时间",
        "backToNow": "回到当前时间",
        "worldTime": "世界时间",
        "stripHint": "下方色条是基准时区 0～23 点对应的当地时间，",
        "work": "工作时间",
        "day": "白天",
        "night": "夜间",
        "stripHint2": "；点击可设为基准时间",
        "baseOffset": "基准 · {offset}",
        "hourTitle": "基准 {h}:00 = {city} {local}:00",
        "setBase": "设为基准",
        "remove": "移除",
        "addPlaceholder": "添加城市或时区，例如 巴黎、America/Chicago",
        "add": "添加"
      }
    },
    "en": {
      "convert": {
        "sameTime": "Same time",
        "ahead": "{n} h ahead",
        "behind": "{n} h behind",
        "nextDay": "next day",
        "prevDay": "previous day",
        "commonCities": "Common cities",
        "allZones": "All time zones",
        "base": "Base",
        "baseZone": "Base time zone",
        "setTime": "Set time (in the base time zone)",
        "showingNow": "Showing the current time",
        "backToNow": "Back to now",
        "worldTime": "World clock",
        "stripHint": "The bars show local time for hours 0–23 in the base time zone: ",
        "work": "working hours",
        "day": "daytime",
        "night": "night",
        "stripHint2": "; click to set the base time",
        "baseOffset": "Base · {offset}",
        "hourTitle": "Base {h}:00 = {city} {local}:00",
        "setBase": "Set as base",
        "remove": "Remove",
        "addPlaceholder": "Add a city or time zone, e.g. Paris, America/Chicago",
        "add": "Add"
      }
    },
    "ja": {
      "convert": {
        "sameTime": "時差なし",
        "ahead": "{n} 時間進んでいる",
        "behind": "{n} 時間遅れている",
        "nextDay": "翌日",
        "prevDay": "前日",
        "commonCities": "主な都市",
        "allZones": "すべてのタイムゾーン",
        "base": "基準",
        "baseZone": "基準のタイムゾーン",
        "setTime": "時刻を設定（基準のタイムゾーン）",
        "showingNow": "現在時刻を表示中",
        "backToNow": "現在時刻に戻る",
        "worldTime": "世界時計",
        "stripHint": "下のバーは基準タイムゾーンの 0～23 時に対応する現地時刻です：",
        "work": "勤務時間",
        "day": "昼間",
        "night": "夜間",
        "stripHint2": "。クリックすると基準時刻に設定します",
        "baseOffset": "基準 · {offset}",
        "hourTitle": "基準 {h}:00 = {city} {local}:00",
        "setBase": "基準に設定",
        "remove": "削除",
        "addPlaceholder": "都市やタイムゾーンを追加（例：パリ、America/Chicago）",
        "add": "追加"
      }
    }
  }
});
