/**
 * 查询 IP 地址的归属地。
 *
 * 依次尝试几个免费服务（都无需注册），前一个连不上或出错时自动换下一个，
 * 因为不同网络环境下能访问的服务不一样。
 * 这是本程序除检查更新外少数会访问外部网络的功能，只在打开「IP 地址与位置查询」或点击查询时请求。
 */
import { locale, t } from "@/locales";

/** 服务明确回答「查询失败」（比如 IP 格式不对），换别的服务也没用 */
class QueryError extends Error {}
const queryFailed = (detail?: string) => new QueryError(detail ? t("network.queryFailedDetail", { error: detail }) : t("network.queryFailed"));

export interface IpInfo {
  ip: string;
  type: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  postal: string;
  latitude: number;
  longitude: number;
  isp: string;
  org: string;
  asn: string;
  timezone: string;
  utcOffset: string;
  /** 实际返回数据的服务 */
  source: string;
}

type Raw = Record<string, any>;

interface Provider {
  name: string;
  url: (ip: string) => string;
  parse: (data: Raw) => IpInfo;
}

const ipType = (ip: string) => (ip.includes(":") ? "IPv6" : ip ? "IPv4" : "");

/** 秒数偏移 → +08:00 */
export const formatOffset = (seconds: number) => {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  return `${sign}${String(Math.floor(abs / 3600)).padStart(2, "0")}:${String(Math.floor((abs % 3600) / 60)).padStart(2, "0")}`;
};

export const PROVIDERS: Provider[] = [
  {
    // 返回中文地名，速度快；免费版只支持 HTTP
    name: "ip-api.com",
    url: (ip) =>
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=${locale.value === "zh-CN" ? "zh-CN" : "en"}&fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,offset,isp,org,as,query`,
    parse: (d) => {
      if (d.status !== "success") throw queryFailed(d.message);
      return {
        ip: d.query ?? "",
        type: ipType(d.query ?? ""),
        country: d.country ?? "",
        countryCode: d.countryCode ?? "",
        region: d.regionName ?? "",
        city: d.city ?? "",
        postal: d.zip ?? "",
        latitude: Number(d.lat),
        longitude: Number(d.lon),
        isp: d.isp ?? "",
        org: d.org ?? "",
        asn: (d.as ?? "").split(" ")[0],
        timezone: d.timezone ?? "",
        utcOffset: typeof d.offset === "number" ? formatOffset(d.offset) : "",
        source: "ip-api.com",
      };
    },
  },
  {
    name: "ipwho.is",
    url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}?lang=zh-CN`,
    parse: (d) => {
      if (d.success === false) throw queryFailed(d.message);
      return {
        ip: d.ip ?? "",
        type: d.type ?? ipType(d.ip ?? ""),
        country: d.country ?? "",
        countryCode: d.country_code ?? "",
        region: d.region ?? "",
        city: d.city ?? "",
        postal: d.postal ?? "",
        latitude: Number(d.latitude),
        longitude: Number(d.longitude),
        isp: d.connection?.isp ?? "",
        org: d.connection?.org ?? "",
        asn: d.connection?.asn ? `AS${d.connection.asn}` : "",
        timezone: d.timezone?.id ?? "",
        utcOffset: d.timezone?.utc ?? "",
        source: "ipwho.is",
      };
    },
  },
  {
    name: "ipapi.co",
    url: (ip) => (ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : "https://ipapi.co/json/"),
    parse: (d) => {
      if (d.error) throw queryFailed(d.reason);
      const offset = String(d.utc_offset ?? "");
      return {
        ip: d.ip ?? "",
        type: d.version ?? ipType(d.ip ?? ""),
        country: d.country_name ?? "",
        countryCode: d.country_code ?? "",
        region: d.region ?? "",
        city: d.city ?? "",
        postal: d.postal ?? "",
        latitude: Number(d.latitude),
        longitude: Number(d.longitude),
        isp: d.org ?? "",
        org: d.org ?? "",
        asn: d.asn ?? "",
        timezone: d.timezone ?? "",
        // -0500 → -05:00
        utcOffset: /^[+-]\d{4}$/.test(offset) ? `${offset.slice(0, 3)}:${offset.slice(3)}` : offset,
        source: "ipapi.co",
      };
    },
  },
];

export const SERVICE_NAMES = PROVIDERS.map((p) => p.name).join("、");

/** 查询本机公网 IP（ip 为空）或指定 IP；依次尝试各个服务 */
export async function lookupIp(ip = ""): Promise<IpInfo> {
  const target = ip.trim();
  let lastError = "";
  for (const provider of PROVIDERS) {
    try {
      const response = await fetch(provider.url(target), { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return provider.parse(await response.json());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // 服务明确回答「查询失败」（比如 IP 格式不对）时，换别的服务也没用
      if (e instanceof QueryError) throw e;
      lastError = message;
    }
  }
  throw new Error(t("network.noService", { services: SERVICE_NAMES }) + (lastError ? t("network.lastError", { error: lastError }) : ""));
}

/** 经纬度格式化为「39.9042° N, 116.4074° E」 */
export function formatCoordinates(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}
