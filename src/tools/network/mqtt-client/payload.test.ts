import { describe, expect, it } from "vitest";
import { MAX_PAYLOAD } from "./mqtt";
import { encodePayload, formatPayload } from "./payload";

describe("MQTT 消息格式", () => {
  it("Plaintext 和 JSON 保留原文的 UTF-8 字节，JSON 仅校验不重写", () => {
    for (const [payload, format] of [["你好🌍", "text"], [' {"large":9007199254740993} ', "json"]] as const) {
      expect(encodePayload(payload, format)).toEqual({ bytes: new TextEncoder().encode(payload) });
    }
    expect(encodePayload("{", "json")).toEqual({ error: "jsonError" });
    expect(encodePayload("", "json")).toEqual({ error: "jsonError" });
  });

  it("Hex 和 Base64 忽略空白，解码后保留非 UTF-8 字节和零字节", () => {
    const bytes = Uint8Array.from([255, 0, 128, 65]);
    for (const payload of ["ff008041", "FF 00\n80\t41"]) expect(encodePayload(payload, "hex")).toEqual({ bytes });
    for (const payload of ["/wCAQQ==", "/wCAQQ", " /wCA\nQQ== "]) expect(encodePayload(payload, "base64")).toEqual({ bytes });
    for (const format of ["text", "base64", "hex"] as const) expect(encodePayload("", format)).toEqual({ bytes: new Uint8Array() });
  });

  it("非法字符、单个 Hex 半字节和错误 Base64 填充不能发送", () => {
    for (const payload of ["f", "0g", "0xFF", "ff:00", "ff 0"]) expect(encodePayload(payload, "hex")).toEqual({ error: "hexError" });
    for (const payload of ["A", "@@==", "YQ=", "=YQ=", "YQ===", "YW=Jj", "Zh==", "_w=="]) expect(encodePayload(payload, "base64")).toEqual({ error: "base64Error" });
  });

  it("列表四种显示格式共用原始字节，不丢失 BOM、Unicode 和二进制", () => {
    const original = [255, 0, 128, 65];
    expect(formatPayload(original, "hex")).toBe("ff 00 80 41");
    expect(formatPayload(original, "base64")).toBe("/wCAQQ==");
    expect(formatPayload(original, "text")).toBe("�\0�A");
    expect(formatPayload(original, "json")).toBe("�\0�A");
    const unicode = [...new TextEncoder().encode("你好🌍")];
    expect(formatPayload(unicode, "text")).toBe("你好🌍");
    expect(formatPayload([239, 187, 191, 65], "hex")).toBe("ef bb bf 41");
    expect(formatPayload([239, 187, 191, 65], "text")).toBe("\uFEFFA");
    expect(formatPayload([...new TextEncoder().encode('{"a":1}')], "json")).toBe('{\n  "a": 1\n}');
    expect(formatPayload([...new TextEncoder().encode("plain")], "json")).toBe("plain");
    for (const format of ["text", "base64", "hex"] as const) expect(formatPayload([], format)).toBe("");
    expect(original).toEqual([255, 0, 128, 65]);
  });

  it("256 KiB 限额按解码字节计算，大消息转换不触发参数数量上限", () => {
    const bytes = Array.from({ length: MAX_PAYLOAD }, (_, index) => index % 256);
    for (const format of ["base64", "hex"] as const) {
      const representation = formatPayload(bytes, format);
      expect(representation.length).toBeGreaterThan(MAX_PAYLOAD);
      expect(encodePayload(representation, format)).toEqual({ bytes: Uint8Array.from(bytes) });
      expect(encodePayload(formatPayload([...bytes, 0], format), format)).toEqual({ error: "payloadError" });
    }
    expect(encodePayload("a".repeat(MAX_PAYLOAD), "text").bytes?.length).toBe(MAX_PAYLOAD);
    expect(encodePayload("温".repeat(Math.floor(MAX_PAYLOAD / 3) + 1), "text")).toEqual({ error: "payloadError" });
  });
});
