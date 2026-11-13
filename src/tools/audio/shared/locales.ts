import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "messages": {
    "zh-CN": {
      "audio": {
        "decodeFailed": "无法读取，可能不是音频文件，或者格式不受支持",
        "mp3Failed": "MP3 编码失败",
        "mp3FailedDetail": "MP3 编码失败：{error}",
        "quality": "音质",
        "q128": "普通",
        "q192": "高",
        "q320": "最高",
        "lossless": "无损格式，文件较大",
        "play": "播放",
        "pause": "暂停",
        "stop": "停止",
        "listen": "试听",
        "track": "音轨",
        "trackEmpty": "添加文件后在这里显示音轨，可以试听",
        "trackFailed": "无法读取这段声音的波形，仍然可以播放",
        "readingWave": "正在读取波形…",
        "reading": "正在读取…",
        "clear": "清空",
        "export": "导出",
        "saveAudio": "保存音频"
      }
    },
    "en": {
      "audio": {
        "decodeFailed": "Can't read this file — it may not be audio, or the format isn't supported",
        "mp3Failed": "MP3 encoding failed",
        "mp3FailedDetail": "MP3 encoding failed: {error}",
        "quality": "Quality",
        "q128": "Normal",
        "q192": "High",
        "q320": "Best",
        "lossless": "Lossless format, larger files",
        "play": "Play",
        "pause": "Pause",
        "stop": "Stop",
        "listen": "Preview",
        "track": "Track",
        "trackEmpty": "Add files to see the waveform here and listen",
        "trackFailed": "Can't read the waveform of this audio, but it can still be played",
        "readingWave": "Reading waveform…",
        "reading": "Reading…",
        "clear": "Clear",
        "export": "Export",
        "saveAudio": "Save audio"
      }
    },
    "ja": {
      "audio": {
        "decodeFailed": "読み込めません。音声ファイルではないか、対応していない形式です",
        "mp3Failed": "MP3 のエンコードに失敗しました",
        "mp3FailedDetail": "MP3 のエンコードに失敗しました：{error}",
        "quality": "音質",
        "q128": "標準",
        "q192": "高",
        "q320": "最高",
        "lossless": "ロスレス形式。ファイルは大きめです",
        "play": "再生",
        "pause": "一時停止",
        "stop": "停止",
        "listen": "試聴",
        "track": "トラック",
        "trackEmpty": "ファイルを追加するとここに波形が表示され、試聴できます",
        "trackFailed": "この音声の波形を読み込めませんでしたが、再生はできます",
        "readingWave": "波形を読み込み中…",
        "reading": "読み込み中…",
        "clear": "クリア",
        "export": "書き出し",
        "saveAudio": "音声を保存"
      }
    }
  }
});
