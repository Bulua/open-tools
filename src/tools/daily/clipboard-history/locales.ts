import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "clipboard-history": {
        "name": "Clipboard History",
        "desc": "Record plain text you copy so you can find it by date and copy it again"
      }
    },
    "ja": {
      "clipboard-history": {
        "name": "クリップボード履歴",
        "desc": "コピーしたプレーンテキストを記録し、日付で探して再コピーできます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "encode": {
        "clipboardSettings": "设置",
        "clipboardShortcutHint": "按下组合键后保存。",
        "clipboardLimit": "历史条数上限",
        "clipboardLimitRange": "1–{max} 条。调低上限会删除较早的记录。",
        "clipboardSave": "保存",
        "clipboardTimeline": "时间目录",
        "clipboardHourRange": "{start} – {end}",
        "clipboardCount": "{count} 条",
        "clipboardCloseSettings": "关闭设置",
        "clipboardCopied": "已复制",
        "clipboardTitle": "剪贴板历史",
        "clipboardRecording": "记录剪贴板",
        "clipboardShortcut": "全局快捷键",
        "clipboardShortcutUnavailable": "无法注册这个快捷键，请试试其他组合。",
        "clipboardOpen": "打开小窗",
        "clipboardRetention": "历史加密保存在本机，保留 7 天。单条上限 256 KiB，总容量上限 4 MiB。",
        "clipboardSearch": "搜索历史",
        "clipboardPaused": "记录已暂停，仍可使用已有历史。",
        "clipboardCopy": "复制",
        "clipboardDelete": "删除此条",
        "clipboardClear": "清空历史",
        "clipboardConfirmClear": "确认全部清空",
        "clipboardCancel": "取消",
        "clipboardClose": "关闭小窗",
        "clipboardKeys": "↑↓ 选择 · Enter 复制 · Esc 关闭",
        "clipboardNoMatches": "没有匹配的历史",
        "clipboardEmpty": "复制一段文本后，历史会显示在这里。",
        "clipboardUnavailable": "无法读取剪贴板历史",
        "clipboardLoading": "正在读取历史…"
      }
    },
    "en": {
      "encode": {
        "clipboardSettings": "Settings",
        "clipboardShortcutHint": "Press a key combination, then save.",
        "clipboardLimit": "History limit",
        "clipboardLimitRange": "1–{max} entries. Lowering the limit removes older entries.",
        "clipboardSave": "Save",
        "clipboardTimeline": "Timeline",
        "clipboardHourRange": "{start} – {end}",
        "clipboardCount": "{count} item | {count} items",
        "clipboardCloseSettings": "Close settings",
        "clipboardCopied": "Copied",
        "clipboardTitle": "Clipboard history",
        "clipboardRecording": "Record clipboard history",
        "clipboardShortcut": "Global shortcut",
        "clipboardShortcutUnavailable": "The shortcut could not be registered. Try a different key combination.",
        "clipboardOpen": "Open quick panel",
        "clipboardRetention": "History is kept for 7 days and encrypted on this device. Up to 256 KiB per entry and 4 MiB in total.",
        "clipboardSearch": "Search history",
        "clipboardPaused": "Recording is paused. You can still use existing entries.",
        "clipboardCopy": "Copy",
        "clipboardDelete": "Delete entry",
        "clipboardClear": "Clear history",
        "clipboardConfirmClear": "Confirm clear all",
        "clipboardCancel": "Cancel",
        "clipboardClose": "Close quick panel",
        "clipboardKeys": "↑↓ Select · Enter Copy · Esc Close",
        "clipboardNoMatches": "No matching entries",
        "clipboardEmpty": "Text you copy will appear here.",
        "clipboardUnavailable": "Clipboard history is unavailable",
        "clipboardLoading": "Loading history…"
      }
    },
    "ja": {
      "encode": {
        "clipboardSettings": "設定",
        "clipboardShortcutHint": "キーの組み合わせを押し、保存してください。",
        "clipboardLimit": "履歴の上限",
        "clipboardLimitRange": "1〜{max} 件。上限を下げると古い履歴が削除されます。",
        "clipboardSave": "保存",
        "clipboardTimeline": "タイムライン",
        "clipboardHourRange": "{start} – {end}",
        "clipboardCount": "{count} 件",
        "clipboardCloseSettings": "設定を閉じる",
        "clipboardCopied": "コピー済み",
        "clipboardTitle": "クリップボード履歴",
        "clipboardRecording": "クリップボード履歴を記録",
        "clipboardShortcut": "グローバルショートカット",
        "clipboardShortcutUnavailable": "ショートカットを登録できません。別のキーの組み合わせを試してください。",
        "clipboardOpen": "クイックパネルを開く",
        "clipboardRetention": "履歴はこの端末で暗号化して 7 日間保存します。1 件あたり 256 KiB、合計 4 MiB までです。",
        "clipboardSearch": "履歴を検索",
        "clipboardPaused": "記録を一時停止しました。既存の履歴は引き続き使えます。",
        "clipboardCopy": "コピー",
        "clipboardDelete": "この項目を削除",
        "clipboardClear": "履歴を消去",
        "clipboardConfirmClear": "すべて消去する",
        "clipboardCancel": "キャンセル",
        "clipboardClose": "クイックパネルを閉じる",
        "clipboardKeys": "↑↓ 選択 · Enter コピー · Esc 閉じる",
        "clipboardNoMatches": "一致する履歴がありません",
        "clipboardEmpty": "コピーしたテキストがここに表示されます。",
        "clipboardUnavailable": "クリップボード履歴を読み込めません",
        "clipboardLoading": "履歴を読み込み中…"
      }
    }
  }
});
