import { describe, expect, it } from "vitest";
import { htmlEscape, sha, unicodeEscape, unicodeUnescape } from "./transforms";

describe("编码 / 加密", () => {
  it("Unicode 互转", () => {
    expect(unicodeEscape("工具")).toBe("\\u5de5\\u5177");
    expect(unicodeUnescape("\\u5de5\\u5177")).toBe("工具");
  });

  it("HTML 转义", () => {
    expect(htmlEscape('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });

  it("SHA-256", async () => {
    expect(await sha("SHA-256", "abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
