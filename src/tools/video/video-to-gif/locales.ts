import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "video-to-gif": {
        "name": "Video to GIF",
        "desc": "Turn a whole video into an animated GIF with adjustable frame rate, width, colors and looping; processed locally, nothing uploaded"
      }
    },
    "ja": {
      "video-to-gif": {
        "name": "動画から GIF へ",
        "desc": "動画全体を GIF アニメに変換します。フレームレート・幅・色数・ループを設定でき、ローカルで処理するのでアップロードしません"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "video": {
        "gifFps": "帧率",
        "gifWidth": "宽度",
        "gifOriginal": "原始",
        "gifColors": "颜色数",
        "gifPlayback": "播放",
        "gifLoop": "循环播放",
        "gifOnce": "只播一次",
        "gifOutput": "输出 {width}×{height}，共 {frames} 帧。",
        "gifFpsLowered": "视频较长，帧数超过上限，帧率自动降为每秒 {fps} 帧。",
        "gifSizeTip": "帧率、宽度、颜色数越低，文件越小。",
        "gifConvert": "转换为 GIF",
        "gifProcessing": "正在转换 · {percent}%",
        "gifCancel": "停止（{percent}%）",
        "gifLocalTip": "在本机处理，不上传文件。",
        "gifSourceVideo": "原视频",
        "gifReplace": "更换视频",
        "gifReplaceShort": "更换",
        "gifDrop": "拖入视频文件，或点击选择",
        "gifDropHint": "支持 MP4、MOV、MKV、WebM、TS，把整段视频转成 GIF 动图",
        "gifResultInfo": "GIF {size} · {frames} 帧",
        "gifSave": "保存 GIF",
        "gifNoVideo": "这个文件里没有视频画面",
        "gifFailed": "转换失败，可能是视频编码不受支持",
        "gifFailedWith": "转换失败：{error}"
      }
    },
    "en": {
      "video": {
        "gifFps": "Frame rate",
        "gifWidth": "Width",
        "gifOriginal": "Original",
        "gifColors": "Colors",
        "gifPlayback": "Playback",
        "gifLoop": "Loop",
        "gifOnce": "Play once",
        "gifOutput": "Output {width}×{height}, {frames} frames.",
        "gifFpsLowered": "The video is long, so the frame rate is lowered to {fps} fps to stay within the frame limit.",
        "gifSizeTip": "Lower frame rate, width and colors make a smaller file.",
        "gifConvert": "Convert to GIF",
        "gifProcessing": "Converting · {percent}%",
        "gifCancel": "Stop ({percent}%)",
        "gifLocalTip": "Processed on this computer; nothing is uploaded.",
        "gifSourceVideo": "Video",
        "gifReplace": "Replace video",
        "gifReplaceShort": "Replace",
        "gifDrop": "Drop a video file here, or click to choose",
        "gifDropHint": "Supports MP4, MOV, MKV, WebM, TS; turns the whole video into an animated GIF",
        "gifResultInfo": "GIF {size} · {frames} frames",
        "gifSave": "Save GIF",
        "gifNoVideo": "This file has no video picture",
        "gifFailed": "Conversion failed; the video codec may not be supported",
        "gifFailedWith": "Conversion failed: {error}"
      }
    },
    "ja": {
      "video": {
        "gifFps": "フレームレート",
        "gifWidth": "幅",
        "gifOriginal": "元のサイズ",
        "gifColors": "色数",
        "gifPlayback": "再生",
        "gifLoop": "ループ",
        "gifOnce": "1 回だけ",
        "gifOutput": "出力 {width}×{height}、{frames} フレーム。",
        "gifFpsLowered": "動画が長くフレーム数の上限を超えるため、フレームレートを {fps} fps に下げます。",
        "gifSizeTip": "フレームレート・幅・色数を下げるとファイルが小さくなります。",
        "gifConvert": "GIF に変換",
        "gifProcessing": "変換中 · {percent}%",
        "gifCancel": "停止（{percent}%）",
        "gifLocalTip": "このパソコンで処理し、ファイルはアップロードしません。",
        "gifSourceVideo": "元の動画",
        "gifReplace": "動画を変更",
        "gifReplaceShort": "変更",
        "gifDrop": "動画ファイルをドロップ、またはクリックして選択",
        "gifDropHint": "MP4・MOV・MKV・WebM・TS に対応。動画全体を GIF アニメにします",
        "gifResultInfo": "GIF {size} · {frames} フレーム",
        "gifSave": "GIF を保存",
        "gifNoVideo": "このファイルには映像がありません",
        "gifFailed": "変換に失敗しました。動画のコーデックに対応していない可能性があります",
        "gifFailedWith": "変換に失敗しました：{error}"
      }
    }
  }
});
