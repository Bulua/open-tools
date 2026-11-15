import { describe, expect, it } from "vitest";
import { relativeTime } from "@/utils/time";
import { decodeJwt, jwtStatus } from "./jwt";

// jwt.io 的示例 token
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

describe("JWT", () => {
  it("解码 Header 与 Payload", () => {
    const r = decodeJwt(TOKEN);
    expect(r.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(r.payload).toEqual({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
    expect(r.signature).toBe("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
  });

  it("支持 Bearer 前缀", () => {
    expect(decodeJwt(`Bearer ${TOKEN}`).header.alg).toBe("HS256");
  });

  it("格式错误给出提示", () => {
    expect(() => decodeJwt("abc")).toThrow("三段");
    expect(() => decodeJwt("abc.def.ghi")).toThrow("Header");
  });

  it("判断是否过期", () => {
    const now = 1_700_000_000_000;
    expect(jwtStatus({ exp: 1_600_000_000 }, now)).toBe("expired");
    expect(jwtStatus({ exp: 1_800_000_000 }, now)).toBe("valid");
    expect(jwtStatus({ nbf: 1_800_000_000 }, now)).toBe("notYetValid");
    expect(jwtStatus({}, now)).toBe("noExpiry");
  });

  it("相对时间", () => {
    const now = 1_700_000_000_000;
    expect(relativeTime(now + 3 * 86400_000, now)).toBe("3 天后");
    expect(relativeTime(now - 2 * 3600_000, now)).toBe("2 小时前");
    expect(relativeTime(now + 1000, now)).toBe("刚刚");
  });
});
