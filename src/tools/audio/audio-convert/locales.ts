import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "audio-convert": {
        "name": "Audio Converter",
        "desc": "Convert between MP3, WAV, M4A, FLAC and more, or extract audio from videos like MP4"
      }
    },
    "ja": {
      "audio-convert": {
        "name": "音声形式変換",
        "desc": "MP3・WAV・M4A・FLAC などを相互変換し、MP4 などの動画から音声も取り出せます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "audio": {
        "sourceVideo": "原视频声音",
        "sourceFile": "原文件",
        "result": "转换结果",
        "zipName": "音频.zip",
        "convertTo": "转换为",
        "converting": "转换中…",
        "checkToConvert": "请勾选要转换的文件",
        "convertSelected": "转换选中的 {n} 个",
        "convertOne": "转换并保存",
        "videoTip": "也可以拖入视频文件（MP4、MOV、WebM），提取其中的声音",
        "dropFiles": "拖入音频或视频文件，或点击选择（可多选）",
        "dropFilesHint": "支持 MP3、WAV、M4A、AAC、OGG、FLAC，以及 MP4、MOV、WebM 视频",
        "saveOne": "保存这个文件",
        "addMore": "继续添加文件",
        "allDone": "全部转换完成，点文件右侧的 ✓ 可以单独保存"
      }
    },
    "en": {
      "audio": {
        "sourceVideo": "Original video audio",
        "sourceFile": "Original file",
        "result": "Converted",
        "zipName": "Audio.zip",
        "convertTo": "Convert to",
        "converting": "Converting…",
        "checkToConvert": "Check the files to convert",
        "convertSelected": "Convert {n} selected",
        "convertOne": "Convert and save",
        "videoTip": "You can also drop video files (MP4, MOV, WebM) to extract their audio",
        "dropFiles": "Drop audio or video files here, or click to choose (multiple allowed)",
        "dropFilesHint": "Supports MP3, WAV, M4A, AAC, OGG, FLAC and MP4, MOV, WebM videos",
        "saveOne": "Save this file",
        "addMore": "Add more files",
        "allDone": "All done. Click ✓ next to a file to save it on its own"
      }
    },
    "ja": {
      "audio": {
        "sourceVideo": "元の動画の音声",
        "sourceFile": "元のファイル",
        "result": "変換結果",
        "zipName": "音声.zip",
        "convertTo": "変換先",
        "converting": "変換中…",
        "checkToConvert": "変換するファイルをチェックしてください",
        "convertSelected": "選択した {n} 件を変換",
        "convertOne": "変換して保存",
        "videoTip": "動画ファイル（MP4・MOV・WebM）をドロップして音声を取り出すこともできます",
        "dropFiles": "音声または動画ファイルをドロップ、またはクリックして選択（複数可）",
        "dropFilesHint": "MP3・WAV・M4A・AAC・OGG・FLAC、および MP4・MOV・WebM 動画に対応",
        "saveOne": "このファイルを保存",
        "addMore": "ファイルを追加",
        "allDone": "すべて変換しました。ファイル右側の ✓ で個別に保存できます"
      }
    }
  }
});
