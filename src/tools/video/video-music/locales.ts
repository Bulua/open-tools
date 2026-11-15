import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "video-music": {
        "name": "Add Music to Video",
        "desc": "Add background music with adjustable music and original volume, looped or played a set number of times; video is not re-encoded"
      }
    },
    "ja": {
      "video-music": {
        "name": "動画に BGM を追加",
        "desc": "動画に BGM を追加し、BGM と元の音声の音量、ループや再生回数を調整します。映像は再エンコードしません"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "video": {
        "musicLonger": "音乐比视频长，只播放到视频结束",
        "musicLoops": "音乐循环播放约 {n} 遍，直到视频结束",
        "timesUnfinished": "播放 {n} 次，到视频结束时还没播完",
        "timesSilent": "播放 {n} 次，{time} 之后没有音乐",
        "mixSuffix": "配乐",
        "video": "视频",
        "hasSound": "有原声",
        "noOriginalSound": "没有原声",
        "replaceVideo": "更换视频",
        "chooseVideo": "选择视频",
        "musicLabel": "音乐",
        "replaceMusic": "更换音乐",
        "removeMusic": "去掉音乐",
        "chooseMusic": "选择音乐",
        "volume": "音量",
        "originalSound": "原声",
        "mute": "静音",
        "playback": "音乐播放",
        "loop": "循环播放",
        "playTimes": "播放几次",
        "oneLess": "少一次",
        "oneMore": "多一次",
        "timesUnit": "次",
        "fadeOutEnd": "视频结束时音乐逐渐变小",
        "mixing": "正在合成 {n}%",
        "mix": "合成视频",
        "mixDone": "合成完成 · {size}，画面没有重新编码",
        "mixTip": "选好视频和音乐后，可以先在右侧试听效果，满意了再合成。",
        "mixResult": "合成结果",
        "preview": "预览",
        "backToPreview": "返回预览",
        "previewEmpty": "选择视频和音乐后，在这里预览效果",
        "seekTitle": "点击跳到这个位置",
        "loopN": "第 {n} 遍：{start} – {end}",
        "noMusicYet": "还没有选择音乐"
      }
    },
    "en": {
      "video": {
        "musicLonger": "The music is longer than the video and stops when the video ends",
        "musicLoops": "The music loops about {n} times until the video ends",
        "timesUnfinished": "Plays {n} times and is still playing when the video ends",
        "timesSilent": "Plays {n} times; no music after {time}",
        "mixSuffix": "with music",
        "video": "Video",
        "hasSound": "has audio",
        "noOriginalSound": "no audio",
        "replaceVideo": "Choose another video",
        "chooseVideo": "Choose a video",
        "musicLabel": "Music",
        "replaceMusic": "Choose other music",
        "removeMusic": "Remove music",
        "chooseMusic": "Choose music",
        "volume": "Volume",
        "originalSound": "Original",
        "mute": "Muted",
        "playback": "Music playback",
        "loop": "Loop",
        "playTimes": "Play N times",
        "oneLess": "One less",
        "oneMore": "One more",
        "timesUnit": "times",
        "fadeOutEnd": "Fade out the music at the end",
        "mixing": "Mixing {n}%",
        "mix": "Create video",
        "mixDone": "Done · {size}; the video wasn't re-encoded",
        "mixTip": "After choosing the video and music, preview on the right and create the video once you're happy.",
        "mixResult": "Result",
        "preview": "Preview",
        "backToPreview": "Back to preview",
        "previewEmpty": "Choose a video and music to preview here",
        "seekTitle": "Click to jump here",
        "loopN": "Loop {n}: {start} – {end}",
        "noMusicYet": "No music chosen yet"
      }
    },
    "ja": {
      "video": {
        "musicLonger": "BGM が動画より長いため、動画の終わりまで再生します",
        "musicLoops": "BGM を約 {n} 回ループして、動画の終わりまで再生します",
        "timesUnfinished": "{n} 回再生し、動画の終わりでもまだ再生中です",
        "timesSilent": "{n} 回再生し、{time} 以降は BGM がありません",
        "mixSuffix": "BGM付き",
        "video": "動画",
        "hasSound": "元の音声あり",
        "noOriginalSound": "元の音声なし",
        "replaceVideo": "別の動画を選択",
        "chooseVideo": "動画を選択",
        "musicLabel": "BGM",
        "replaceMusic": "別の BGM を選択",
        "removeMusic": "BGM を外す",
        "chooseMusic": "BGM を選択",
        "volume": "音量",
        "originalSound": "元の音声",
        "mute": "ミュート",
        "playback": "BGM の再生",
        "loop": "ループ再生",
        "playTimes": "回数を指定",
        "oneLess": "1 回減らす",
        "oneMore": "1 回増やす",
        "timesUnit": "回",
        "fadeOutEnd": "動画の終わりで BGM をフェードアウト",
        "mixing": "合成中 {n}%",
        "mix": "動画を合成",
        "mixDone": "合成完了 · {size}。映像は再エンコードしていません",
        "mixTip": "動画と BGM を選んだら、右側で試聴して、納得したら合成してください。",
        "mixResult": "合成結果",
        "preview": "プレビュー",
        "backToPreview": "プレビューに戻る",
        "previewEmpty": "動画と BGM を選ぶと、ここでプレビューできます",
        "seekTitle": "クリックしてこの位置へ移動",
        "loopN": "{n} 回目：{start} – {end}",
        "noMusicYet": "BGM が選択されていません"
      }
    }
  }
});
