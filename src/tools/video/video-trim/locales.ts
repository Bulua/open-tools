import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "video-trim": {
        "name": "Video Trimmer",
        "desc": "Drag the timeline to keep the part you need, and optionally crop the picture or change it to 16:9, 9:16 and more; trimming only is done without re-encoding — fast and lossless"
      }
    },
    "ja": {
      "video-trim": {
        "name": "動画のトリミング",
        "desc": "タイムラインをドラッグして必要な部分を残し、画面の範囲を切り抜いたり 16:9・9:16 などの比率に変えたりできます。長さだけの場合は再エンコードせず、高速・無劣化です"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "video": {
        "trimRange": "保留时间段",
        "trimStart": "开始",
        "trimEnd": "结束",
        "trimSetNow": "设为当前",
        "trimSetNowHint": "用视频当前播放到的时间",
        "trimKeep": "保留 {length}；也可以拖动时间轴两端的把手。",
        "trimRangeHint": "添加视频后，拖动时间轴两端选择要保留的部分",
        "trimCropFrame": "裁剪画面",
        "trimFree": "自由",
        "trimCropSize": "保留区域 {width}×{height}，拖动画面上的框调整。",
        "trimCropFull": "拖动画面上的框选择要保留的区域。",
        "trimMode": "截取方式",
        "trimFast": "快速无损",
        "trimPrecise": "精确到帧",
        "trimFastTip": "直接复制，不重新编码，速度快、画质不变；开头会对齐到最近的关键帧，可能比所选时间早一点。",
        "trimPreciseTip": "重新编码，开头和结尾精确到所选时间；速度较慢。",
        "trimCropTip": "裁剪画面需要重新编码，速度较慢。",
        "trimExport": "导出 MP4",
        "trimStop": "停止（{percent}%）",
        "trimResult": "已导出 {size}",
        "trimSaveAgain": "再次保存",
        "trimCopied": " · 直接复制",
        "trimLocalTip": "在本机处理，不上传文件。",
        "trimReplace": "更换视频",
        "trimReplaceShort": "更换",
        "trimDrop": "拖入视频文件，或点击选择",
        "trimDropHint": "支持 MP4、MOV、MKV、WebM、TS，裁剪时长和画面后导出为 MP4",
        "trimPlay": "播放保留的部分",
        "trimPause": "暂停",
        "trimSuffix": "裁剪",
        "trimFailedWith": "裁剪失败：{error}"
      }
    },
    "en": {
      "video": {
        "trimRange": "Keep",
        "trimStart": "Start",
        "trimEnd": "End",
        "trimSetNow": "Use current",
        "trimSetNowHint": "Use the video's current playback time",
        "trimKeep": "Keeping {length}; you can also drag the handles at both ends of the timeline.",
        "trimRangeHint": "Add a video, then drag both ends of the timeline to choose the part to keep",
        "trimCropFrame": "Crop picture",
        "trimFree": "Free",
        "trimCropSize": "Keeping {width}×{height}; drag the box on the picture to adjust.",
        "trimCropFull": "Drag the box on the picture to choose the area to keep.",
        "trimMode": "Method",
        "trimFast": "Fast, lossless",
        "trimPrecise": "Frame-accurate",
        "trimFastTip": "Copies without re-encoding — fast, same quality. The start snaps to the nearest key frame, so it may begin slightly earlier.",
        "trimPreciseTip": "Re-encodes so the start and end match the chosen times exactly; slower.",
        "trimCropTip": "Cropping the picture requires re-encoding, which is slower.",
        "trimExport": "Export MP4",
        "trimStop": "Stop ({percent}%)",
        "trimResult": "Exported {size}",
        "trimSaveAgain": "Save again",
        "trimCopied": " · copied directly",
        "trimLocalTip": "Processed on this computer; nothing is uploaded.",
        "trimReplace": "Replace video",
        "trimReplaceShort": "Replace",
        "trimDrop": "Drop a video file here, or click to choose",
        "trimDropHint": "Supports MP4, MOV, MKV, WebM, TS; trim the length and picture, then export as MP4",
        "trimPlay": "Play the kept part",
        "trimPause": "Pause",
        "trimSuffix": "trimmed",
        "trimFailedWith": "Trimming failed: {error}"
      }
    },
    "ja": {
      "video": {
        "trimRange": "残す範囲",
        "trimStart": "開始",
        "trimEnd": "終了",
        "trimSetNow": "現在位置",
        "trimSetNowHint": "動画の現在の再生位置を使います",
        "trimKeep": "{length} を残します。タイムライン両端のハンドルもドラッグできます。",
        "trimRangeHint": "動画を追加して、タイムラインの両端をドラッグして残す部分を選んでください",
        "trimCropFrame": "画面を切り抜く",
        "trimFree": "自由",
        "trimCropSize": "{width}×{height} を残します。画面上の枠をドラッグして調整します。",
        "trimCropFull": "画面上の枠をドラッグして残す範囲を選んでください。",
        "trimMode": "方法",
        "trimFast": "高速・無劣化",
        "trimPrecise": "フレーム単位",
        "trimFastTip": "再エンコードせずにコピーするので高速で画質も変わりません。開始位置は直前のキーフレームに合わせるため、少し早く始まることがあります。",
        "trimPreciseTip": "再エンコードして、開始と終了を選んだ時間に正確に合わせます。時間がかかります。",
        "trimCropTip": "画面の切り抜きには再エンコードが必要なため、時間がかかります。",
        "trimExport": "MP4 を書き出す",
        "trimStop": "停止（{percent}%）",
        "trimResult": "{size} を書き出しました",
        "trimSaveAgain": "もう一度保存",
        "trimCopied": " · そのままコピー",
        "trimLocalTip": "このパソコンで処理し、ファイルはアップロードしません。",
        "trimReplace": "動画を変更",
        "trimReplaceShort": "変更",
        "trimDrop": "動画ファイルをドロップ、またはクリックして選択",
        "trimDropHint": "MP4・MOV・MKV・WebM・TS に対応。長さと画面をトリミングして MP4 で書き出します",
        "trimPlay": "残す部分を再生",
        "trimPause": "一時停止",
        "trimSuffix": "トリミング",
        "trimFailedWith": "トリミングに失敗しました：{error}"
      }
    }
  }
});
