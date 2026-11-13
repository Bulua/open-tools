import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "countdown": {
        "name": "Countdown",
        "desc": "Count down to a time or run a timer, with repeat reminders; kept until deleted and alerts you when due"
      }
    },
    "ja": {
      "countdown": {
        "name": "カウントダウン",
        "desc": "指定日時までのカウントダウンやタイマー。繰り返し通知が可能で、削除するまで保存され、時間になると通知します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "utility": {
        "daysClock": "{n} 天 {clock}",
        "pickTime": "请选择时间",
        "timePassed": "这个时间已经过去了",
        "countdown": "倒计时",
        "needDuration": "请设置时长",
        "timerName": "{time} 计时",
        "toTime": "到指定时间",
        "timer": "计时器",
        "namePlaceholderDate": "名称，例如 项目上线、生日",
        "namePlaceholderTimer": "名称，例如 番茄钟、泡面",
        "time": "时间",
        "repeat": "重复",
        "duration": "时长",
        "h": "时",
        "m": "分",
        "s": "秒",
        "hours": "{n} 小时",
        "minutes": "{n} 分钟",
        "addCountdown": "添加倒计时",
        "countdownTip": "倒计时会一直保存，关闭程序也不会丢失；到期时弹出提醒并播放提示音。",
        "noCountdowns": "还没有倒计时",
        "noCountdownsHint": "在左侧设置时间或时长，添加后会显示在这里",
        "paused": "已暂停",
        "expired": "已到期",
        "expiredAt": "{time}到期",
        "pausing": "暂停中",
        "resume": "继续",
        "pause": "暂停",
        "restart": "重新开始",
        "confirmDeleteTitle": "再点一次确认删除",
        "delete": "删除",
        "confirmDelete": "确认删除"
      }
    },
    "en": {
      "utility": {
        "daysClock": "{n}d {clock}",
        "pickTime": "Choose a time",
        "timePassed": "That time has already passed",
        "countdown": "Countdown",
        "needDuration": "Set a duration",
        "timerName": "{time} timer",
        "toTime": "Until a time",
        "timer": "Timer",
        "namePlaceholderDate": "Name, e.g. Launch, Birthday",
        "namePlaceholderTimer": "Name, e.g. Pomodoro, Noodles",
        "time": "Time",
        "repeat": "Repeat",
        "duration": "Duration",
        "h": "h",
        "m": "m",
        "s": "s",
        "hours": "{n} h",
        "minutes": "{n} min",
        "addCountdown": "Add countdown",
        "countdownTip": "Countdowns are saved even after the app closes; when one is due you'll get an alert with a sound.",
        "noCountdowns": "No countdowns yet",
        "noCountdownsHint": "Set a time or duration on the left; added countdowns appear here",
        "paused": "Paused",
        "expired": "Due",
        "expiredAt": "due {time}",
        "pausing": "Paused",
        "resume": "Resume",
        "pause": "Pause",
        "restart": "Restart",
        "confirmDeleteTitle": "Click again to delete",
        "delete": "Delete",
        "confirmDelete": "Confirm"
      }
    },
    "ja": {
      "utility": {
        "daysClock": "{n} 日 {clock}",
        "pickTime": "時刻を選んでください",
        "timePassed": "その時刻はすでに過ぎています",
        "countdown": "カウントダウン",
        "needDuration": "時間の長さを設定してください",
        "timerName": "{time} タイマー",
        "toTime": "指定時刻まで",
        "timer": "タイマー",
        "namePlaceholderDate": "名前（例：リリース、誕生日）",
        "namePlaceholderTimer": "名前（例：ポモドーロ、カップ麺）",
        "time": "時刻",
        "repeat": "繰り返し",
        "duration": "時間の長さ",
        "h": "時",
        "m": "分",
        "s": "秒",
        "hours": "{n} 時間",
        "minutes": "{n} 分",
        "addCountdown": "カウントダウンを追加",
        "countdownTip": "カウントダウンはアプリを閉じても保存されます。時間になると通知とともに音が鳴ります。",
        "noCountdowns": "カウントダウンはまだありません",
        "noCountdownsHint": "左で時刻または時間の長さを設定して追加すると、ここに表示されます",
        "paused": "一時停止中",
        "expired": "時間切れ",
        "expiredAt": "{time}に時間切れ",
        "pausing": "一時停止中",
        "resume": "再開",
        "pause": "一時停止",
        "restart": "最初からやり直す",
        "confirmDeleteTitle": "もう一度クリックすると削除します",
        "delete": "削除",
        "confirmDelete": "削除を確定"
      }
    }
  }
});
