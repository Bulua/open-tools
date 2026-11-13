import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "ping": {
        "name": "Ping",
        "desc": "Test latency and packet loss to an address"
      }
    },
    "ja": {
      "ping": {
        "name": "Ping テスト",
        "desc": "指定したアドレスまでの遅延とパケットロスを測定します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "network": {
        "noReply": "无响应",
        "hostNotFound": "找不到主机，请检查地址",
        "unreachable": "目标不可达",
        "networkFailure": "网络故障，请检查网络连接",
        "times": "{n} 次",
        "continuous": "持续",
        "hostPlaceholder": "域名或 IP，例如 www.baidu.com",
        "start": "开始",
        "stop": "停止",
        "pingDesktop": "Ping 需要调用系统命令，只能在安装后的桌面版中使用。",
        "badHost": "地址只能包含字母、数字、点、短横线和冒号",
        "avg": "平均延迟",
        "minMax": "最小 / 最大",
        "loss": "丢包率",
        "sentReceived": "已发送 / 收到",
        "running": " · 进行中",
        "from": "来自 {ip}",
        "pingEmpty": "输入地址后点「开始」，每秒 ping 一次，超时时间 {n} 秒"
      }
    },
    "en": {
      "network": {
        "noReply": "No response",
        "hostNotFound": "Host not found — check the address",
        "unreachable": "Destination unreachable",
        "networkFailure": "Network failure — check your connection",
        "times": "{n} times",
        "continuous": "Continuous",
        "hostPlaceholder": "Domain or IP, e.g. www.example.com",
        "start": "Start",
        "stop": "Stop",
        "pingDesktop": "Ping runs a system command, so it's only available in the installed desktop app.",
        "badHost": "Addresses can only contain letters, digits, dots, hyphens and colons",
        "avg": "Average",
        "minMax": "Min / Max",
        "loss": "Packet loss",
        "sentReceived": "Sent / Received",
        "running": " · running",
        "from": "From {ip}",
        "pingEmpty": "Enter an address and click “Start” — pings once a second with a {n}-second timeout"
      }
    },
    "ja": {
      "network": {
        "noReply": "応答なし",
        "hostNotFound": "ホストが見つかりません。アドレスを確認してください",
        "unreachable": "宛先に到達できません",
        "networkFailure": "ネットワーク障害です。接続を確認してください",
        "times": "{n} 回",
        "continuous": "連続",
        "hostPlaceholder": "ドメインまたは IP（例：www.example.com）",
        "start": "開始",
        "stop": "停止",
        "pingDesktop": "Ping はシステムのコマンドを使うため、インストール版のデスクトップアプリでのみ利用できます。",
        "badHost": "アドレスには英字・数字・ドット・ハイフン・コロンのみ使えます",
        "avg": "平均遅延",
        "minMax": "最小 / 最大",
        "loss": "パケットロス",
        "sentReceived": "送信 / 受信",
        "running": " · 実行中",
        "from": "{ip} から",
        "pingEmpty": "アドレスを入力して「開始」をクリックすると、1 秒ごとに ping します（タイムアウト {n} 秒）"
      }
    }
  }
});
