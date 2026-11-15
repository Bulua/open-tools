import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "recorder": {
        "name": "Voice Recorder",
        "desc": "Record from the microphone with pause, then preview and save as MP3 or WAV"
      }
    },
    "ja": {
      "recorder": {
        "name": "ボイスレコーダー",
        "desc": "マイクで録音し、一時停止も可能。録音後に試聴して MP3 または WAV で保存します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "audio": {
        "micFailed": "无法使用麦克风：请检查是否连接了麦克风，以及系统设置中是否允许应用访问麦克风",
        "recordingName": "录音 {n} · {time}",
        "saveFormat": "保存格式",
        "recordTip": "录音只保存在本次打开的程序中，关闭后会丢失，需要的请及时保存。",
        "recordingNow": "正在录音…",
        "paused": "已暂停",
        "recordHint": "点击下方按钮开始录音",
        "startRecord": "开始录音",
        "resume": "继续",
        "stopRecord": "结束录音",
        "recordings": "录音",
        "recordCount": "{n} 段",
        "saving": "保存中…",
        "save": "保存",
        "delete": "删除",
        "recordEmpty": "录好的音频会出现在这里"
      }
    },
    "en": {
      "audio": {
        "micFailed": "Can't use the microphone. Check that one is connected and that apps are allowed to use it in system settings",
        "recordingName": "Recording {n} · {time}",
        "saveFormat": "Save as",
        "recordTip": "Recordings are kept only while the app is open and are lost when it closes — save the ones you need.",
        "recordingNow": "Recording…",
        "paused": "Paused",
        "recordHint": "Click the button below to start recording",
        "startRecord": "Start recording",
        "resume": "Resume",
        "stopRecord": "Stop recording",
        "recordings": "Recordings",
        "recordCount": "{n}",
        "saving": "Saving…",
        "save": "Save",
        "delete": "Delete",
        "recordEmpty": "Your recordings will appear here"
      }
    },
    "ja": {
      "audio": {
        "micFailed": "マイクを使用できません。マイクが接続されているか、システム設定でアプリのマイクへのアクセスが許可されているか確認してください",
        "recordingName": "録音 {n} · {time}",
        "saveFormat": "保存形式",
        "recordTip": "録音はアプリを開いている間だけ保持され、閉じると失われます。必要なものは早めに保存してください。",
        "recordingNow": "録音中…",
        "paused": "一時停止中",
        "recordHint": "下のボタンをクリックして録音を開始",
        "startRecord": "録音を開始",
        "resume": "再開",
        "stopRecord": "録音を終了",
        "recordings": "録音",
        "recordCount": "{n} 件",
        "saving": "保存中…",
        "save": "保存",
        "delete": "削除",
        "recordEmpty": "録音した音声はここに表示されます"
      }
    }
  }
});
