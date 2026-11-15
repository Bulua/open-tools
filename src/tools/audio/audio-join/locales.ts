import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "audio-join": {
        "name": "Audio Joiner",
        "desc": "Join several audio clips in order, with reordering and gaps between them"
      }
    },
    "ja": {
      "audio-join": {
        "name": "音声の結合",
        "desc": "複数の音声を順番に 1 つに結合。順番の入れ替えや間隔の挿入も可能"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "audio": {
        "gapNone": "无",
        "gapSeconds": "{n} 秒",
        "segments": "共 {n} 段",
        "joinedName": "拼接音频",
        "gap": "片段之间留空白",
        "joining": "拼接中…",
        "join": "拼接并保存",
        "needTwo": "至少添加两个音频",
        "joinSummary": "共 {n} 段，总时长 {time}",
        "order": "拼接顺序",
        "orderHint": "从上到下依次拼接，可以拖动调整",
        "dropJoin": "拖入要拼接的音频，或点击选择（可多选）",
        "dropJoinHint": "按添加的顺序排列，之后可以调整",
        "moveUp": "上移",
        "moveDown": "下移",
        "addAudio": "继续添加音频",
        "joinedTrack": "拼接效果",
        "joinedEmpty": "添加音频后在这里显示拼接后的音轨，可以试听"
      }
    },
    "en": {
      "audio": {
        "gapNone": "None",
        "gapSeconds": "{n} s",
        "segments": "{n} clips",
        "joinedName": "Joined audio",
        "gap": "Gap between clips",
        "joining": "Joining…",
        "join": "Join and save",
        "needTwo": "Add at least two audio files",
        "joinSummary": "{n} clips, {time} in total",
        "order": "Order",
        "orderHint": "Joined from top to bottom; drag to reorder",
        "dropJoin": "Drop the audio files to join, or click to choose (multiple allowed)",
        "dropJoinHint": "Listed in the order added; you can reorder them afterwards",
        "moveUp": "Move up",
        "moveDown": "Move down",
        "addAudio": "Add more audio",
        "joinedTrack": "Joined result",
        "joinedEmpty": "Add audio to see and listen to the joined track here"
      }
    },
    "ja": {
      "audio": {
        "gapNone": "なし",
        "gapSeconds": "{n} 秒",
        "segments": "{n} 個",
        "joinedName": "結合した音声",
        "gap": "クリップ間の間隔",
        "joining": "結合中…",
        "join": "結合して保存",
        "needTwo": "音声を 2 つ以上追加してください",
        "joinSummary": "{n} 個、合計 {time}",
        "order": "結合順",
        "orderHint": "上から順に結合します。ドラッグで並べ替えできます",
        "dropJoin": "結合する音声をドロップ、またはクリックして選択（複数可）",
        "dropJoinHint": "追加した順に並びます。あとで並べ替えできます",
        "moveUp": "上へ",
        "moveDown": "下へ",
        "addAudio": "音声を追加",
        "joinedTrack": "結合結果",
        "joinedEmpty": "音声を追加すると、結合後のトラックがここに表示され試聴できます"
      }
    }
  }
});
