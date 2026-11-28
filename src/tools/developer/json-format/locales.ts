import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "json-format": {
        "name": "JSON Formatter",
        "desc": "Beautify, minify and browse JSON as a tree, with live validation that pinpoints errors"
      }
    },
    "ja": {
      "json-format": {
        "name": "JSON 整形",
        "desc": "JSON を整形・圧縮・ツリー表示し、リアルタイムに検証してエラー箇所を示します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "json": {
        "format": "格式化",
        "minify": "压缩",
        "spaces": "{n} 空格",
        "sortKeys": "按键名排序",
        "input": "输入",
        "inputPlaceholder": "粘贴 JSON，例如 {example}",
        "valid": "有效",
        "jumpToError": "跳到出错位置",
        "errorLine": "第 {line} 行有误",
        "invalid": "格式有误",
        "result": "结果",
        "resultPlaceholder": "结果会实时显示在这里",
        "code": "代码",
        "tree": "树形",
        "collapseAll": "全部折叠",
        "expandAll": "全部展开",
        "locateError": "定位到出错位置",
        "treeEmptyTitle": "还没有数据",
        "treeEmptyDesc": "在左侧粘贴 JSON，这里会以树形结构展示，点击节点可以复制它的路径。",
        "items": "{n} 项",
        "keys": "{n} 个键",
        "path": "路径",
        "pathHint": "点击节点查看路径",
        "copyPath": "复制路径"
      }
    },
    "en": {
      "json": {
        "format": "Format",
        "minify": "Minify",
        "spaces": "{n} spaces",
        "sortKeys": "Sort keys",
        "input": "Input",
        "inputPlaceholder": "Paste JSON, e.g. {example}",
        "valid": "Valid",
        "jumpToError": "Jump to the error",
        "errorLine": "Error on line {line}",
        "invalid": "Invalid",
        "result": "Result",
        "resultPlaceholder": "The result appears here as you type",
        "code": "Code",
        "tree": "Tree",
        "collapseAll": "Collapse all",
        "expandAll": "Expand all",
        "locateError": "Go to error",
        "treeEmptyTitle": "No data yet",
        "treeEmptyDesc": "Paste JSON on the left to see it as a tree. Click a node to copy its path.",
        "items": "{n} items",
        "keys": "{n} keys",
        "path": "Path",
        "pathHint": "Click a node to see its path",
        "copyPath": "Copy path"
      }
    },
    "ja": {
      "json": {
        "format": "整形",
        "minify": "圧縮",
        "spaces": "スペース {n}",
        "sortKeys": "キーで並べ替え",
        "input": "入力",
        "inputPlaceholder": "JSON を貼り付け（例：{example}）",
        "valid": "有効",
        "jumpToError": "エラー箇所へ移動",
        "errorLine": "{line} 行目にエラー",
        "invalid": "形式エラー",
        "result": "結果",
        "resultPlaceholder": "結果はリアルタイムにここへ表示されます",
        "code": "コード",
        "tree": "ツリー",
        "collapseAll": "すべて折りたたむ",
        "expandAll": "すべて展開",
        "locateError": "エラー箇所へ移動",
        "treeEmptyTitle": "データがありません",
        "treeEmptyDesc": "左に JSON を貼り付けるとツリー表示されます。ノードをクリックするとパスをコピーできます。",
        "items": "{n} 項目",
        "keys": "{n} キー",
        "path": "パス",
        "pathHint": "ノードをクリックしてパスを表示",
        "copyPath": "パスをコピー"
      }
    }
  }
});
