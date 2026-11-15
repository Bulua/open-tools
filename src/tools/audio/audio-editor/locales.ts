import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "audio-editor": {
        "name": "Audio Editor",
        "desc": "Select a range on the waveform to keep or delete it; fade in/out and adjust volume"
      }
    },
    "ja": {
      "audio-editor": {
        "name": "音声編集",
        "desc": "波形上で範囲を選んで残す / 削除し、フェードや音量を調整します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "audio": {
        "exporting": "导出中…",
        "editSuffix": "_剪辑",
        "selection": "选区",
        "seconds": "（{n} 秒）",
        "selectHint": "在右侧波形上拖动选择一段",
        "keepTitle": "只保留选中的部分",
        "keep": "保留选区",
        "cutTitle": "删除选中的部分",
        "cut": "删除选区",
        "fadeInTitle": "有选区时作用于选区，否则作用于开头 3 秒",
        "fadeIn": "淡入",
        "fadeOutTitle": "有选区时作用于选区，否则作用于结尾 3 秒",
        "fadeOut": "淡出",
        "volume": "音量",
        "autoVolumeTitle": "把最响的地方调到合适的音量，适合声音太小的录音",
        "autoVolume": "自动调整",
        "noAudio": "未选择音频",
        "undo": "撤销",
        "replaceTitle": "更换音频",
        "replace": "更换",
        "dropAudio": "拖入音频文件，或点击选择",
        "dropAudioHint": "也可以拖入视频文件，剪辑其中的声音",
        "playSpace": "播放（空格）",
        "pauseSpace": "暂停（空格）",
        "waveEmpty": "添加音频后在上方显示波形",
        "waveHint": "点击波形定位，拖动选择一段；{extra}",
        "waveHintSel": "播放时只播放选区",
        "waveHintSpace": "空格键播放 / 暂停"
      }
    },
    "en": {
      "audio": {
        "exporting": "Exporting…",
        "editSuffix": "_edited",
        "selection": "Selection",
        "seconds": " ({n} s)",
        "selectHint": "Drag on the waveform to select a range",
        "keepTitle": "Keep only the selected part",
        "keep": "Keep",
        "cutTitle": "Delete the selected part",
        "cut": "Delete",
        "fadeInTitle": "Applies to the selection, or the first 3 seconds if nothing is selected",
        "fadeIn": "Fade in",
        "fadeOutTitle": "Applies to the selection, or the last 3 seconds if nothing is selected",
        "fadeOut": "Fade out",
        "volume": "Volume",
        "autoVolumeTitle": "Bring the loudest part to a good level — handy for quiet recordings",
        "autoVolume": "Auto",
        "noAudio": "No audio selected",
        "undo": "Undo",
        "replaceTitle": "Choose another audio file",
        "replace": "Replace",
        "dropAudio": "Drop an audio file here, or click to choose",
        "dropAudioHint": "You can also drop a video file to edit its audio",
        "playSpace": "Play (Space)",
        "pauseSpace": "Pause (Space)",
        "waveEmpty": "Add audio to see its waveform above",
        "waveHint": "Click the waveform to seek, drag to select a range; {extra}",
        "waveHintSel": "only the selection is played",
        "waveHintSpace": "Space to play / pause"
      }
    },
    "ja": {
      "audio": {
        "exporting": "書き出し中…",
        "editSuffix": "_編集",
        "selection": "選択範囲",
        "seconds": "（{n} 秒）",
        "selectHint": "右の波形上をドラッグして範囲を選択",
        "keepTitle": "選択した部分だけを残す",
        "keep": "残す",
        "cutTitle": "選択した部分を削除",
        "cut": "削除",
        "fadeInTitle": "選択範囲に適用。選択していないときは先頭 3 秒に適用",
        "fadeIn": "フェードイン",
        "fadeOutTitle": "選択範囲に適用。選択していないときは末尾 3 秒に適用",
        "fadeOut": "フェードアウト",
        "volume": "音量",
        "autoVolumeTitle": "最も大きい部分を適切な音量に合わせます。小さすぎる録音に便利です",
        "autoVolume": "自動調整",
        "noAudio": "音声が選択されていません",
        "undo": "元に戻す",
        "replaceTitle": "別の音声を選択",
        "replace": "変更",
        "dropAudio": "音声ファイルをドロップ、またはクリックして選択",
        "dropAudioHint": "動画ファイルをドロップして音声を編集することもできます",
        "playSpace": "再生（スペース）",
        "pauseSpace": "一時停止（スペース）",
        "waveEmpty": "音声を追加すると上に波形が表示されます",
        "waveHint": "波形をクリックで移動、ドラッグで範囲選択。{extra}",
        "waveHintSel": "再生時は選択範囲だけを再生します",
        "waveHintSpace": "スペースキーで再生 / 一時停止"
      }
    }
  }
});
