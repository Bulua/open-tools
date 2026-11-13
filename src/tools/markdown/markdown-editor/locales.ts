import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "markdown-editor": {
        "name": "Markdown Editor",
        "desc": "Edit on the left with a live preview on the right; tables, task lists and code highlighting; export to Word and HTML"
      }
    },
    "ja": {
      "markdown-editor": {
        "name": "Markdown エディター",
        "desc": "左で編集、右でリアルタイムプレビュー。表・タスクリスト・コードハイライトに対応し、Word と HTML に書き出せます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "markdown": {
        "edit": "编辑",
        "split": "分栏",
        "preview": "预览",
        "open": "打开",
        "exportHtml": "导出 HTML",
        "exportWord": "导出 Word",
        "exporting": "导出中…",
        "exportFailed": "导出失败：{error}",
        "placeholder": "在这里输入或粘贴 Markdown，也可以点右上角「打开」读取 .md 文件",
        "words": "{n} 字",
        "outline": "目录",
        "emptyPreview": "在左侧输入 Markdown，这里实时显示排版效果",
        "insertSample": "插入示例"
      }
    },
    "en": {
      "markdown": {
        "edit": "Edit",
        "split": "Split",
        "preview": "Preview",
        "open": "Open",
        "exportHtml": "Export HTML",
        "exportWord": "Export Word",
        "exporting": "Exporting…",
        "exportFailed": "Export failed: {error}",
        "placeholder": "Type or paste Markdown here, or click “Open” at the top right to load a .md file",
        "words": "{n} words",
        "outline": "Outline",
        "emptyPreview": "Type Markdown on the left to see it formatted here",
        "insertSample": "Insert sample"
      }
    },
    "ja": {
      "markdown": {
        "edit": "編集",
        "split": "分割",
        "preview": "プレビュー",
        "open": "開く",
        "exportHtml": "HTML に書き出す",
        "exportWord": "Word に書き出す",
        "exporting": "書き出し中…",
        "exportFailed": "書き出しに失敗しました：{error}",
        "placeholder": "Markdown を入力または貼り付け。右上の「開く」から .md ファイルも読み込めます",
        "words": "{n} 文字",
        "outline": "目次",
        "emptyPreview": "左に Markdown を入力すると、ここにリアルタイムで表示されます",
        "insertSample": "サンプルを挿入"
      }
    }
  }
});
