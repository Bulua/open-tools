import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "ip-lookup": {
        "name": "IP Address & Location",
        "desc": "See your public IP, region, coordinates and ISP, or look up any IP"
      }
    },
    "ja": {
      "ip-lookup": {
        "name": "IP アドレスと位置情報",
        "desc": "この PC のグローバル IP・地域・緯度経度・プロバイダーを確認、任意の IP も検索できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "network": {
        "queryFailed": "查询失败",
        "queryFailedDetail": "查询失败：{error}",
        "noService": "无法连接查询服务（已尝试 {services}），请检查网络。",
        "lastError": "最后的错误：{error}",
        "location": "位置",
        "coordinates": "经纬度",
        "coordinatesRaw": "经纬度（数值）",
        "isp": "运营商",
        "org": "组织",
        "timezone": "时区",
        "postal": "邮编",
        "ipType": "IP 类型",
        "source": "数据来源",
        "localIp": "局域网 IP",
        "selfIp": "本机公网 IP",
        "queriedIp": "查询的 IP",
        "querying": "查询中…",
        "copyIp": "复制 IP",
        "ipPlaceholder": "查询其他 IP，例如 8.8.8.8",
        "query": "查询",
        "selfTitle": "重新查询本机",
        "self": "本机",
        "details": "详细信息",
        "queryingLong": "正在查询…",
        "noData": "暂无数据",
        "ipNotice1": "归属地数据来自免费的公共服务（依次尝试 {services}），查询时会把要查询的 IP 发送给该服务，其中 ip-api.com 不支持加密传输；",
        "ipNotice2": "位置根据 IP 估算，精确到城市级别，使用代理或 VPN 时显示的是代理服务器的位置。"
      }
    },
    "en": {
      "network": {
        "queryFailed": "Lookup failed",
        "queryFailedDetail": "Lookup failed: {error}",
        "noService": "Couldn't reach a lookup service (tried {services}). Check your network.",
        "lastError": "Last error: {error}",
        "location": "Location",
        "coordinates": "Coordinates",
        "coordinatesRaw": "Coordinates (decimal)",
        "isp": "ISP",
        "org": "Organization",
        "timezone": "Time zone",
        "postal": "Postal code",
        "ipType": "IP type",
        "source": "Source",
        "localIp": "LAN IP",
        "selfIp": "Your public IP",
        "queriedIp": "Queried IP",
        "querying": "Looking up…",
        "copyIp": "Copy IP",
        "ipPlaceholder": "Look up another IP, e.g. 8.8.8.8",
        "query": "Look up",
        "selfTitle": "Look up this computer again",
        "self": "Mine",
        "details": "Details",
        "queryingLong": "Looking up…",
        "noData": "No data",
        "ipNotice1": "Location data comes from free public services (tried in order: {services}). The IP being looked up is sent to them, and ip-api.com doesn't support encryption. ",
        "ipNotice2": "Locations are estimated from the IP to city level; with a proxy or VPN you'll see the proxy's location."
      }
    },
    "ja": {
      "network": {
        "queryFailed": "検索に失敗しました",
        "queryFailedDetail": "検索に失敗しました：{error}",
        "noService": "検索サービスに接続できません（試したサービス：{services}）。ネットワークを確認してください。",
        "lastError": "最後のエラー：{error}",
        "location": "位置",
        "coordinates": "緯度経度",
        "coordinatesRaw": "緯度経度（数値）",
        "isp": "プロバイダー",
        "org": "組織",
        "timezone": "タイムゾーン",
        "postal": "郵便番号",
        "ipType": "IP の種類",
        "source": "データ提供元",
        "localIp": "LAN の IP",
        "selfIp": "この PC のグローバル IP",
        "queriedIp": "検索した IP",
        "querying": "検索中…",
        "copyIp": "IP をコピー",
        "ipPlaceholder": "他の IP を検索（例：8.8.8.8）",
        "query": "検索",
        "selfTitle": "この PC を再検索",
        "self": "この PC",
        "details": "詳細",
        "queryingLong": "検索しています…",
        "noData": "データがありません",
        "ipNotice1": "位置情報は無料の公開サービス（{services} の順に試行）から取得します。検索する IP はそのサービスに送信され、ip-api.com は暗号化通信に対応していません。",
        "ipNotice2": "位置は IP から都市単位で推定したものです。プロキシや VPN を使っている場合はプロキシサーバーの位置が表示されます。"
      }
    }
  }
});
