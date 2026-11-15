import { describe, expect, it } from "vitest";
import { htmlEscape, unicodeEscape, unicodeUnescape, urlDecode, urlEncode } from "./transforms";

describe("URL", () => {
  it("编码与解码", () => {
    expect(urlEncode("a=1&b=工具")).toBe("a%3D1%26b%3D%E5%B7%A5%E5%85%B7");
    expect(urlDecode("a%3D1%26b%3D%E5%B7%A5%E5%85%B7")).toBe("a=1&b=工具");
  });

  it("+ 解码为空格，非法内容给出提示", () => {
    expect(urlDecode("hello+world")).toBe("hello world");
    expect(() => urlDecode("%E5%B7")).toThrow("不是合法的 URL 编码");
  });
});

describe("Unicode", () => {
  it("只转换非 ASCII 字符", () => {
    expect(unicodeEscape("Hi 工具")).toBe("Hi \\u5de5\\u5177");
    expect(unicodeUnescape("Hi \\u5de5\\u5177")).toBe("Hi 工具");
  });

  it("emoji 可以往返", () => {
    expect(unicodeUnescape(unicodeEscape("😀"))).toBe("😀");
    expect(unicodeUnescape("\\u{1F600}")).toBe("😀");
  });
});

describe("HTML", () => {
  it("转义特殊字符", () => {
    expect(htmlEscape('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});
