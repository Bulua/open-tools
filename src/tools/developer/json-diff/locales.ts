import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "json-diff": {
        "name": "JSON Diff",
        "desc": "Compare two JSON documents and list added, removed and changed fields"
      }
    },
    "ja": {
      "json-diff": {
        "name": "JSON 差分比較",
        "desc": "2 つの JSON を比較し、追加・削除・変更されたフィールドを一覧表示します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "json": {
        "diffLeft": "原始 JSON（左）",
        "diffLeftPlaceholder": "粘贴修改前的 JSON",
        "diffRight": "新 JSON（右）",
        "diffRightPlaceholder": "粘贴修改后的 JSON",
        "diffResult": "对比结果",
        "added": "新增",
        "removed": "删除",
        "changed": "修改",
        "diffHint": "在上方分别粘贴两段 JSON，差异会实时显示在这里。",
        "diffSame": "两段 JSON 内容完全一致。"
      }
    },
    "en": {
      "json": {
        "diffLeft": "Original JSON (left)",
        "diffLeftPlaceholder": "Paste the JSON before changes",
        "diffRight": "New JSON (right)",
        "diffRightPlaceholder": "Paste the JSON after changes",
        "diffResult": "Differences",
        "added": "Added",
        "removed": "Removed",
        "changed": "Changed",
        "diffHint": "Paste two JSON documents above; differences show up here as you type.",
        "diffSame": "The two JSON documents are identical."
      }
    },
    "ja": {
      "json": {
        "diffLeft": "元の JSON（左）",
        "diffLeftPlaceholder": "変更前の JSON を貼り付け",
        "diffRight": "新しい JSON（右）",
        "diffRightPlaceholder": "変更後の JSON を貼り付け",
        "diffResult": "比較結果",
        "added": "追加",
        "removed": "削除",
        "changed": "変更",
        "diffHint": "上の 2 つの欄に JSON を貼り付けると、差分がここにリアルタイムで表示されます。",
        "diffSame": "2 つの JSON は完全に一致しています。"
      }
    }
  }
});
