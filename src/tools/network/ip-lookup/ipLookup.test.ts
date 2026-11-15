import { afterEach, describe, expect, it, vi } from "vitest";
import { PROVIDERS, formatCoordinates, formatOffset, lookupIp } from "./ipLookup";

const provider = (name: string) => PROVIDERS.find((p) => p.name === name)!;

describe("各服务的返回格式", () => {
  it("ip-api.com", () => {
    const info = provider("ip-api.com").parse({
      status: "success",
      country: "美国",
      countryCode: "US",
      regionName: "得克萨斯州",
      city: "休斯敦",
      zip: "77058",
      lat: 29.5726,
      lon: -95.0998,
      timezone: "America/Chicago",
      offset: -18000,
      isp: "Liberally Network",
      org: "Liberally Network, LLC",
      as: "AS32595 Liberally Network, LLC",
      query: "23.172.201.67",
    });
    expect(info).toMatchObject({ ip: "23.172.201.67", type: "IPv4", city: "休斯敦", asn: "AS32595", utcOffset: "-05:00" });
  });

  it("ipwho.is", () => {
    const info = provider("ipwho.is").parse({
      ip: "8.8.8.8",
      success: true,
      type: "IPv4",
      country: "美国",
      city: "山景城",
      latitude: 37.386,
      longitude: -122.0838,
      connection: { asn: 15169, isp: "Google LLC" },
      timezone: { id: "America/Los_Angeles", utc: "-07:00" },
    });
    expect(info).toMatchObject({ ip: "8.8.8.8", asn: "AS15169", isp: "Google LLC", source: "ipwho.is" });
  });

  it("ipapi.co", () => {
    const info = provider("ipapi.co").parse({ ip: "1.1.1.1", version: "IPv4", country_name: "Australia", utc_offset: "+1000", asn: "AS13335", org: "CLOUDFLARENET" });
    expect(info).toMatchObject({ country: "Australia", utcOffset: "+10:00", asn: "AS13335" });
  });

  it("服务明确返回失败时给出原因", () => {
    expect(() => provider("ip-api.com").parse({ status: "fail", message: "invalid query" })).toThrow("invalid query");
  });
});

describe("lookupIp 自动换服务", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("第一个服务连不上时用下一个", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, ip: "8.8.8.8", country: "美国" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const info = await lookupIp("8.8.8.8");
    expect(info).toMatchObject({ ip: "8.8.8.8", source: "ipwho.is" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("全部失败时提示检查网络", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(lookupIp()).rejects.toThrow("无法连接查询服务");
  });

  it("IP 格式错误时不再尝试其他服务", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "fail", message: "invalid query" }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(lookupIp("abc")).rejects.toThrow("invalid query");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("格式化", () => {
  it("经纬度与时区偏移", () => {
    expect(formatCoordinates(39.9042, 116.4074)).toBe("39.9042° N, 116.4074° E");
    expect(formatCoordinates(-33.8688, -70.6693)).toBe("33.8688° S, 70.6693° W");
    expect(formatOffset(28800)).toBe("+08:00");
    expect(formatOffset(-16200)).toBe("-04:30");
  });
});
