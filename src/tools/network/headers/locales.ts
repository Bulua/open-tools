import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "headers": {
        "name": "Headers to JSON / cURL",
        "desc": "Turn request headers copied from the browser or a cURL command into JSON, cURL, fetch or Python code"
      }
    },
    "ja": {
      "headers": {
        "name": "ヘッダー → JSON / cURL",
        "desc": "ブラウザからコピーしたリクエストヘッダーや cURL コマンドを JSON・cURL・fetch・Python のコードに変換します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "network": {
        "jsonInvalid": "JSON 格式有误：{error}",
        "jsonObject": "JSON 需要是 {'{'} \"名称\": \"值\" {'}'} 形式的对象",
        "curlCommand": "cURL 命令",
        "summary": "识别为{source} · {n} 个请求头",
        "summaryRemoved": "（已去掉 {n} 个）",
        "summaryBody": " · 请求体 {n} 字符",
        "dropAutoTitle": "去掉 Content-Length、Host、Connection、Accept-Encoding，这些由工具自动生成",
        "dropAuto": "去掉自动生成的头",
        "dropCookie": "去掉 Cookie",
        "urlPlaceholder": "请求地址（从 Host 或 cURL 中自动识别，也可以手动填写）",
        "input": "输入",
        "headersPlaceholder": "粘贴浏览器开发者工具中复制的请求头（Key: Value 每行一个），也可以粘贴 cURL 命令或 JSON",
        "sample": "示例",
        "resultPlaceholder": "转换结果会实时显示在这里",
        "cmdTitle": "Windows 命令提示符"
      }
    },
    "en": {
      "network": {
        "jsonInvalid": "Invalid JSON: {error}",
        "jsonObject": "JSON must be an object like {'{'} \"name\": \"value\" {'}'}",
        "curlCommand": "cURL command",
        "summary": "Detected {source} · {n} headers",
        "summaryRemoved": " ({n} removed)",
        "summaryBody": " · body {n} characters",
        "dropAutoTitle": "Remove Content-Length, Host, Connection and Accept-Encoding, which tools generate automatically",
        "dropAuto": "Drop auto-generated headers",
        "dropCookie": "Drop Cookie",
        "urlPlaceholder": "Request URL (detected from Host or cURL, or type it in)",
        "input": "Input",
        "headersPlaceholder": "Paste request headers copied from browser dev tools (one Key: Value per line), a cURL command or JSON",
        "sample": "Sample",
        "resultPlaceholder": "The converted result appears here as you type",
        "cmdTitle": "Windows Command Prompt"
      }
    },
    "ja": {
      "network": {
        "jsonInvalid": "JSON の形式が正しくありません：{error}",
        "jsonObject": "JSON は {'{'} \"名前\": \"値\" {'}'} の形式のオブジェクトにしてください",
        "curlCommand": "cURL コマンド",
        "summary": "{source}として認識 · ヘッダー {n} 件",
        "summaryRemoved": "（{n} 件を除外）",
        "summaryBody": " · ボディ {n} 文字",
        "dropAutoTitle": "Content-Length・Host・Connection・Accept-Encoding を除外します（ツールが自動で付けるため）",
        "dropAuto": "自動生成されるヘッダーを除外",
        "dropCookie": "Cookie を除外",
        "urlPlaceholder": "リクエスト先の URL（Host や cURL から自動認識。手動入力も可）",
        "input": "入力",
        "headersPlaceholder": "ブラウザの開発者ツールでコピーしたリクエストヘッダー（1 行に Key: Value）、cURL コマンド、または JSON を貼り付け",
        "sample": "サンプル",
        "resultPlaceholder": "変換結果はリアルタイムでここに表示されます",
        "cmdTitle": "Windows コマンドプロンプト"
      }
    }
  }
});
