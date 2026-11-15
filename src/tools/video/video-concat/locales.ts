import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "video-concat": {
        "name": "Video Joiner",
        "desc": "Join several videos into one MP4; same-format clips are joined without re-encoding — fast and lossless"
      }
    },
    "ja": {
      "video-concat": {
        "name": "動画の結合",
        "desc": "複数の動画を順番に 1 つの MP4 に結合。形式が同じなら再エンコードせず、高速・無劣化です"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "video": {
        "moveUp": "上移",
        "moveDown": "下移",
        "sameAsFirst": "与第 1 个视频相同",
        "sameAsFirstSize": "与第 1 个视频相同（{w}×{h}）",
        "landscape1080": "1920×1080（横屏 1080P）",
        "landscape720": "1280×720（横屏 720P）",
        "portrait1080": "1080×1920（竖屏 1080P）",
        "portrait720": "720×1280（竖屏 720P）",
        "concatName": "拼接视频.mp4",
        "noSound": " · 无声音",
        "concatMode": "拼接方式",
        "needTwoChecked": "添加并勾选至少两个视频",
        "checkingFormat": "正在检查视频格式…",
        "willCopy": "所有视频格式相同，{direct}：不重新编码，速度快、画质无损。",
        "directJoin": "直接拼接",
        "canCopy": "将重新编码为 MP4（H.264），可以统一画面大小。",
        "mustReencode": "视频的格式或画面大小不同，将{reencode}为 MP4（H.264），统一画面大小；大小、比例不同的视频按比例缩放居中，空白处为黑色。",
        "reencode": "重新编码",
        "forceReencode": "仍然重新编码（统一画面大小）",
        "frameSize": "画面大小",
        "hwTip": "重新编码使用电脑的硬件加速，速度取决于显卡，长视频需要一些时间。",
        "joining": "正在拼接 {n}%",
        "joinN": "拼接 {n} 个视频",
        "totalLocal": "合计 {time}；在本机处理，不上传文件。",
        "joinResult": "拼接结果",
        "copiedNote": " · 直接拼接",
        "dragToReorder": "拖动调整顺序",
        "dropJoin": "拖入要拼接的视频，或点击选择（可多选）",
        "dropJoinHint": "按添加的顺序拼接，之后可以拖动调整；支持 MP4、MOV、MKV、WebM、TS"
      }
    },
    "en": {
      "video": {
        "moveUp": "Move up",
        "moveDown": "Move down",
        "sameAsFirst": "Same as the first video",
        "sameAsFirstSize": "Same as the first video ({w}×{h})",
        "landscape1080": "1920×1080 (landscape 1080P)",
        "landscape720": "1280×720 (landscape 720P)",
        "portrait1080": "1080×1920 (portrait 1080P)",
        "portrait720": "720×1280 (portrait 720P)",
        "concatName": "joined video.mp4",
        "noSound": " · no audio",
        "concatMode": "How to join",
        "needTwoChecked": "Add and check at least two videos",
        "checkingFormat": "Checking video formats…",
        "willCopy": "All videos share the same format, so they're {direct}: no re-encoding — fast and lossless.",
        "directJoin": "joined directly",
        "canCopy": "Will re-encode to MP4 (H.264) so the frame size can be unified.",
        "mustReencode": "The videos differ in format or size, so they'll be {reencode} to MP4 (H.264) with one frame size; videos of other sizes or ratios are scaled and centered on black.",
        "reencode": "re-encoded",
        "forceReencode": "Re-encode anyway (unify frame size)",
        "frameSize": "Frame size",
        "hwTip": "Re-encoding uses hardware acceleration; speed depends on your graphics card, and long videos take a while.",
        "joining": "Joining {n}%",
        "joinN": "Join {n} videos",
        "totalLocal": "{time} in total; processed locally, nothing is uploaded.",
        "joinResult": "Result",
        "copiedNote": " · joined directly",
        "dragToReorder": "Drag to reorder",
        "dropJoin": "Drop the videos to join, or click to choose (multiple allowed)",
        "dropJoinHint": "Joined in the order added; drag to reorder. Supports MP4, MOV, MKV, WebM, TS"
      }
    },
    "ja": {
      "video": {
        "moveUp": "上へ",
        "moveDown": "下へ",
        "sameAsFirst": "1 本目の動画と同じ",
        "sameAsFirstSize": "1 本目の動画と同じ（{w}×{h}）",
        "landscape1080": "1920×1080（横向き 1080P）",
        "landscape720": "1280×720（横向き 720P）",
        "portrait1080": "1080×1920（縦向き 1080P）",
        "portrait720": "720×1280（縦向き 720P）",
        "concatName": "結合した動画.mp4",
        "noSound": " · 音声なし",
        "concatMode": "結合方法",
        "needTwoChecked": "動画を 2 本以上追加してチェックしてください",
        "checkingFormat": "動画の形式を確認中…",
        "willCopy": "すべての動画の形式が同じなので{direct}します。再エンコードしないため高速・無劣化です。",
        "directJoin": "そのまま結合",
        "canCopy": "MP4（H.264）に再エンコードし、画面サイズをそろえます。",
        "mustReencode": "動画の形式または画面サイズが異なるため、MP4（H.264）に{reencode}して画面サイズをそろえます。サイズや比率が違う動画は縦横比を保って中央に配置し、余白は黒になります。",
        "reencode": "再エンコード",
        "forceReencode": "それでも再エンコードする（画面サイズをそろえる）",
        "frameSize": "画面サイズ",
        "hwTip": "再エンコードは PC のハードウェアアクセラレーションを使います。速度はグラフィックカードにより、長い動画は時間がかかります。",
        "joining": "結合中 {n}%",
        "joinN": "{n} 本の動画を結合",
        "totalLocal": "合計 {time}。PC 上で処理し、ファイルはアップロードしません。",
        "joinResult": "結合結果",
        "copiedNote": " · そのまま結合",
        "dragToReorder": "ドラッグで並べ替え",
        "dropJoin": "結合する動画をドロップ、またはクリックして選択（複数可）",
        "dropJoinHint": "追加した順に結合し、あとでドラッグして並べ替えできます。MP4・MOV・MKV・WebM・TS に対応"
      }
    }
  }
});
