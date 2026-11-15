import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "password": {
        "name": "Password Generator",
        "desc": "Choose character types, length and charset; uses secure randomness and can generate in bulk"
      }
    },
    "ja": {
      "password": {
        "name": "パスワード生成",
        "desc": "文字の種類・長さ・文字セットを指定し、安全な乱数で生成します。まとめて生成も可能"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "encode": {
        "needCharset": "请至少选择一种字符",
        "instant": "瞬间",
        "overTrillion": "超过一万亿年",
        "about": "约 {n} {unit}",
        "length": "长度",
        "characters": "字符",
        "customPlaceholder": "自定义字符，例如 _-.{'@'}",
        "excludeAmbiguous": "排除易混淆字符（0 O o 1 l I）",
        "requireEach": "每种字符至少出现一次",
        "presets": "快速设置",
        "entropy": "{bits} 位熵 · 暴力破解{time}",
        "regenerateTitle": "重新生成",
        "regenerate": "换一个",
        "copied": "已复制",
        "copy": "复制",
        "batch": "批量生成",
        "countN": "{n} 个",
        "copyAll": "复制全部",
        "clickToCopy": "点击复制",
        "secureNote": "使用系统安全随机数生成，密码只在本机显示，不会保存或上传。",
        "uBig": "亿年",
        "uMid": "万年",
        "uYear": "年",
        "uDay": "天",
        "uHour": "小时",
        "uMinute": "分钟",
        "uSecond": "秒"
      }
    },
    "en": {
      "encode": {
        "needCharset": "Choose at least one character type",
        "instant": "instantly",
        "overTrillion": "over a trillion years",
        "about": "about {n} {unit}",
        "length": "Length",
        "characters": "Characters",
        "customPlaceholder": "Custom characters, e.g. _-.{'@'}",
        "excludeAmbiguous": "Exclude look-alikes (0 O o 1 l I)",
        "requireEach": "Include every chosen type at least once",
        "presets": "Presets",
        "entropy": "{bits} bits of entropy · brute force: {time}",
        "regenerateTitle": "Generate again",
        "regenerate": "New one",
        "copied": "Copied",
        "copy": "Copy",
        "batch": "Batch",
        "countN": "{n}",
        "copyAll": "Copy all",
        "clickToCopy": "Click to copy",
        "secureNote": "Generated with the system's secure random numbers. Passwords are only shown here — never saved or uploaded.",
        "uBig": "billion years",
        "uMid": "million years",
        "uYear": "years",
        "uDay": "days",
        "uHour": "hours",
        "uMinute": "minutes",
        "uSecond": "seconds"
      }
    },
    "ja": {
      "encode": {
        "needCharset": "文字の種類を 1 つ以上選んでください",
        "instant": "一瞬",
        "overTrillion": "1 兆年以上",
        "about": "約 {n} {unit}",
        "length": "長さ",
        "characters": "文字",
        "customPlaceholder": "カスタム文字（例：_-.{'@'}）",
        "excludeAmbiguous": "紛らわしい文字を除外（0 O o 1 l I）",
        "requireEach": "選んだ種類の文字を必ず 1 つ以上含める",
        "presets": "プリセット",
        "entropy": "{bits} ビットのエントロピー · 総当たりで {time}",
        "regenerateTitle": "再生成",
        "regenerate": "別のパスワード",
        "copied": "コピーしました",
        "copy": "コピー",
        "batch": "まとめて生成",
        "countN": "{n} 個",
        "copyAll": "すべてコピー",
        "clickToCopy": "クリックでコピー",
        "secureNote": "システムの安全な乱数で生成します。パスワードはここに表示されるだけで、保存やアップロードはされません。",
        "uBig": "億年",
        "uMid": "万年",
        "uYear": "年",
        "uDay": "日",
        "uHour": "時間",
        "uMinute": "分",
        "uSecond": "秒"
      }
    }
  }
});
