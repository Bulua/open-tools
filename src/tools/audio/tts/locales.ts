import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "tts": {
        "name": "Text to Speech",
        "desc": "Read text aloud with the voices built into Windows, and save it as an audio file"
      }
    },
    "ja": {
      "tts": {
        "name": "テキスト読み上げ",
        "desc": "Windows 標準の音声でテキストを読み上げ、音声ファイルとして保存できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "audio": {
        "female": "女声",
        "male": "男声",
        "rateNormal": "正常",
        "rateFast": "快 {n}",
        "rateSlow": "慢 {n}",
        "speechName": "语音",
        "voice": "声音",
        "loadingVoices": "正在读取本机语音…",
        "rate": "语速",
        "generating": "正在生成…",
        "speak": "朗读",
        "saveAsAudio": "保存为音频",
        "browserOnly": "浏览器中只能朗读；保存音频请使用安装后的桌面版。",
        "text": "文字",
        "chars": "{n} 字",
        "textPlaceholder": "在这里输入或粘贴要朗读的文字"
      }
    },
    "en": {
      "audio": {
        "female": "Female",
        "male": "Male",
        "rateNormal": "Normal",
        "rateFast": "Faster {n}",
        "rateSlow": "Slower {n}",
        "speechName": "speech",
        "voice": "Voice",
        "loadingVoices": "Loading voices on this computer…",
        "rate": "Speed",
        "generating": "Generating…",
        "speak": "Read aloud",
        "saveAsAudio": "Save as audio",
        "browserOnly": "The browser can only read aloud; use the installed desktop app to save audio.",
        "text": "Text",
        "chars": "{n} characters",
        "textPlaceholder": "Type or paste the text to read aloud"
      }
    },
    "ja": {
      "audio": {
        "female": "女性",
        "male": "男性",
        "rateNormal": "標準",
        "rateFast": "速く {n}",
        "rateSlow": "遅く {n}",
        "speechName": "音声",
        "voice": "音声",
        "loadingVoices": "この PC の音声を読み込み中…",
        "rate": "話す速さ",
        "generating": "生成中…",
        "speak": "読み上げ",
        "saveAsAudio": "音声として保存",
        "browserOnly": "ブラウザでは読み上げのみ可能です。音声の保存はインストール版のデスクトップアプリを使ってください。",
        "text": "テキスト",
        "chars": "{n} 文字",
        "textPlaceholder": "読み上げるテキストを入力または貼り付け"
      }
    }
  }
});
