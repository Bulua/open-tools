import { describe, expect, it } from "vitest";
import { isValidHost, parsePingOutput, pingStats } from "./ping";

const ZH_OK = `
正在 Ping www.a.shifen.com [110.242.68.4] 具有 32 字节的数据:
来自 110.242.68.4 的回复: 字节=32 时间=12ms TTL=53

110.242.68.4 的 Ping 统计信息:
    数据包: 已发送 = 1，已接收 = 1，丢失 = 0 (0% 丢失)，`;

const ZH_FAST = `正在 Ping 192.168.1.1 具有 32 字节的数据:
来自 192.168.1.1 的回复: 字节=32 时间<1ms TTL=64`;

const ZH_TIMEOUT = `正在 Ping 10.255.255.1 具有 32 字节的数据:
请求超时。`;

const ZH_UNKNOWN = `Ping 请求找不到主机 nope.invalid。请检查该名称，然后重试。`;

const ZH_UNREACHABLE = `正在 Ping 10.0.0.9 具有 32 字节的数据:
来自 192.168.1.1 的回复: 无法访问目标主机。`;

const EN_OK = `Pinging google.com [142.250.72.14] with 32 bytes of data:
Reply from 142.250.72.14: bytes=32 time=9ms TTL=117`;

const LINUX_OK = `PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=10.2 ms`;

describe("parsePingOutput", () => {
  it("中文 Windows", () => {
    expect(parsePingOutput(ZH_OK)).toEqual({ ok: true, time: 12, under1ms: false, ttl: 53, ip: "110.242.68.4" });
    expect(parsePingOutput(ZH_FAST)).toMatchObject({ ok: true, time: 1, under1ms: true, ttl: 64 });
  });

  it("英文 Windows 与 Linux", () => {
    expect(parsePingOutput(EN_OK)).toMatchObject({ ok: true, time: 9, ttl: 117, ip: "142.250.72.14" });
    expect(parsePingOutput(LINUX_OK)).toMatchObject({ ok: true, time: 10.2, ttl: 57, ip: "1.1.1.1" });
  });

  it("失败的情况", () => {
    expect(parsePingOutput(ZH_TIMEOUT)).toMatchObject({ ok: false, error: "请求超时" });
    expect(parsePingOutput(ZH_UNKNOWN)).toMatchObject({ ok: false, error: "找不到主机，请检查地址" });
    expect(parsePingOutput(ZH_UNREACHABLE)).toMatchObject({ ok: false, error: "目标不可达" });
    expect(parsePingOutput("Request timed out.")).toMatchObject({ ok: false, error: "请求超时" });
  });
});

describe("pingStats", () => {
  it("统计丢包率与延迟", () => {
    const s = pingStats([
      { ok: true, time: 10 },
      { ok: false, error: "请求超时" },
      { ok: true, time: 20 },
      { ok: true, time: 15 },
    ]);
    expect(s).toEqual({ sent: 4, received: 3, loss: 25, min: 10, max: 20, avg: 15 });
  });

  it("全部失败", () => {
    expect(pingStats([{ ok: false }])).toMatchObject({ sent: 1, received: 0, loss: 100, avg: undefined });
  });
});

describe("isValidHost", () => {
  it("允许域名和 IP，拒绝可疑输入", () => {
    expect(isValidHost("www.baidu.com")).toBe(true);
    expect(isValidHost("192.168.1.1")).toBe(true);
    expect(isValidHost("::1")).toBe(true);
    expect(isValidHost("-t 1.1.1.1")).toBe(false);
    expect(isValidHost("1.1.1.1 && calc")).toBe(false);
    expect(isValidHost("")).toBe(false);
  });
});
