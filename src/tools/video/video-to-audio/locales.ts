import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "video-to-audio": {
        "name": "Video to Audio",
        "desc": "Extract the sound from videos — copy the original track (fastest, lossless) or convert to MP3, M4A or WAV; batch processing"
      }
    },
    "ja": {
      "video-to-audio": {
        "name": "動画から音声へ",
        "desc": "動画の音声を取り出します。元の音声トラックをそのままコピー（最速・無劣化）、または MP3・M4A・WAV に変換。まとめて処理できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "video": {
        "originalTrack": "原始音轨",
        "tipOriginal": "直接复制视频里的声音，不重新编码：速度最快、音质无损。格式与视频里的相同，通常是 M4A（AAC）",
        "tipMp3": "兼容性最好，几乎所有设备都能播放",
        "tipM4a": "AAC 编码，同样的音质比 MP3 小；视频里本来就是 AAC 时直接复制",
        "tipWav": "无损格式，文件较大，适合继续剪辑",
        "sourceAudio": "原视频声音",
        "converted": "转换结果",
        "toAudioZip": "视频转音频.zip",
        "convertTo": "转换为",
        "audioQuality": "音质",
        "converting": "转换中…",
        "checkVideos": "请勾选要转换的视频",
        "convertSelected": "转换选中的 {n} 个",
        "extractOne": "提取声音并保存",
        "localTip": "在本机处理，不上传文件；几 GB 的视频也可以转换。",
        "dropToAudio": "拖入视频文件，或点击选择（可多选）",
        "dropToAudioHint": "支持 MP4、MOV、MKV、WebM、TS，提取其中的声音保存为 MP3、M4A、WAV",
        "soundInfo": " · 声音 {codec} {channels}",
        "stereo": "立体声",
        "mono": "单声道",
        "copiedSuffix": "（直接复制）",
        "noSoundToPlay": "这个视频没有可以试听的声音",
        "trackEmpty": "添加视频后在这里显示音轨，可以试听"
      }
    },
    "en": {
      "video": {
        "originalTrack": "Original track",
        "tipOriginal": "Copies the audio as is, without re-encoding: fastest and lossless. Same format as in the video, usually M4A (AAC)",
        "tipMp3": "Most compatible — plays on almost any device",
        "tipM4a": "AAC — smaller than MP3 at the same quality; copied directly when the video already uses AAC",
        "tipWav": "Lossless and larger, good for further editing",
        "sourceAudio": "Original video audio",
        "converted": "Converted",
        "toAudioZip": "Video audio.zip",
        "convertTo": "Convert to",
        "audioQuality": "Quality",
        "converting": "Converting…",
        "checkVideos": "Check the videos to convert",
        "convertSelected": "Convert {n} selected",
        "extractOne": "Extract audio and save",
        "localTip": "Processed locally, nothing is uploaded; even multi-GB videos work.",
        "dropToAudio": "Drop video files here, or click to choose (multiple allowed)",
        "dropToAudioHint": "Supports MP4, MOV, MKV, WebM, TS; extracts the audio as MP3, M4A or WAV",
        "soundInfo": " · audio {codec} {channels}",
        "stereo": "stereo",
        "mono": "mono",
        "copiedSuffix": " (copied)",
        "noSoundToPlay": "This video has no audio to play",
        "trackEmpty": "Add videos to see and listen to the audio track here"
      }
    },
    "ja": {
      "video": {
        "originalTrack": "元の音声トラック",
        "tipOriginal": "動画の音声を再エンコードせずにそのままコピーします。最速・無劣化。形式は動画内と同じで、多くは M4A（AAC）です",
        "tipMp3": "互換性が最も高く、ほぼすべての機器で再生できます",
        "tipM4a": "AAC。同じ音質なら MP3 より小さく、動画がもともと AAC ならそのままコピーします",
        "tipWav": "ロスレス形式。ファイルは大きめで、さらに編集する場合に向いています",
        "sourceAudio": "元の動画の音声",
        "converted": "変換結果",
        "toAudioZip": "動画の音声.zip",
        "convertTo": "変換先",
        "audioQuality": "音質",
        "converting": "変換中…",
        "checkVideos": "変換する動画をチェックしてください",
        "convertSelected": "選択した {n} 件を変換",
        "extractOne": "音声を取り出して保存",
        "localTip": "PC 上で処理し、ファイルはアップロードしません。数 GB の動画も変換できます。",
        "dropToAudio": "動画ファイルをドロップ、またはクリックして選択（複数可）",
        "dropToAudioHint": "MP4・MOV・MKV・WebM・TS に対応。音声を取り出して MP3・M4A・WAV で保存します",
        "soundInfo": " · 音声 {codec} {channels}",
        "stereo": "ステレオ",
        "mono": "モノラル",
        "copiedSuffix": "（そのままコピー）",
        "noSoundToPlay": "この動画には試聴できる音声がありません",
        "trackEmpty": "動画を追加するとここに音声トラックが表示され、試聴できます"
      }
    }
  }
});
