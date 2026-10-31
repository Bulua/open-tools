import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  base64ToText,
  bytesToBase64,
  decodeFile,
  detectFileKind,
  formatFileOutput,
  parseDataUri,
  textToBase64,
} from "./base64";
import { formatBytes } from "@/utils/format";

// 1x1 透明 PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const PNG_URI = `data:image/png;base64,${PNG}`;

describe("文本", () => {
  it("支持中文", () => {
    expect(textToBase64("你好，Open Tools!")).toBe("5L2g5aW977yMT3BlbiBUb29scyE=");
    expect(base64ToText("5L2g5aW977yMT3BlbiBUb29scyE=")).toBe("你好，Open Tools!");
  });

  it("URL 安全写法可以互转", () => {
    const safe = textToBase64("??>>", true);
    expect(safe).toBe("Pz8-Pg");
    expect(base64ToText(safe)).toBe("??>>");
  });

  it("忽略空白、缺少 = 也能解码", () => {
    expect(base64ToText(" aGVs\nbG8 ")).toBe("hello");
  });

  it("非法内容给出提示", () => {
    expect(() => base64ToText("abc$")).toThrow("包含 Base64 以外的字符");
    expect(() => base64ToText(PNG)).toThrow("不是文本");
  });
});

describe("字节", () => {
  it("大数据可以互转", () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe("Data URI 与输出格式", () => {
  it("解析 Data URI", () => {
    expect(parseDataUri(PNG_URI)).toEqual({ mime: "image/png", base64: PNG });
    expect(parseDataUri("hello")).toBeNull();
  });

  it("输出不同格式", () => {
    expect(formatFileOutput(PNG_URI, "base64")).toBe(PNG);
    expect(formatFileOutput(PNG_URI, "css")).toBe(`background-image: url("${PNG_URI}");`);
    expect(formatFileOutput(PNG_URI, "html")).toBe(`<img src="${PNG_URI}" alt="" />`);
  });
});

describe("文件类型识别", () => {
  const kindOf = (text: string) => detectFileKind(new TextEncoder().encode(text))?.ext;

  it("识别常见文件", () => {
    expect(detectFileKind(base64ToBytes(PNG))?.ext).toBe("png");
    expect(kindOf("%PDF-1.7")).toBe("pdf");
    expect(kindOf("PK\x03\x04....")).toBe("zip");
    expect(kindOf("RIFF....WEBPVP8")).toBe("webp");
    expect(kindOf("RIFF....WAVEfmt")).toBe("wav");
    expect(kindOf('<?xml version="1.0"?><svg xmlns="x">')).toBe("svg");
    expect(kindOf("hello")).toBeUndefined();
  });

  it("解码纯 Base64 时自动识别类型", () => {
    const file = decodeFile(PNG);
    expect(file).toMatchObject({ mime: "image/png", ext: "png", isImage: true, dataUri: PNG_URI });
  });

  it("识别不了的视为二进制文件", () => {
    expect(decodeFile("aGVsbG8=")).toMatchObject({ mime: "application/octet-stream", ext: "bin", isImage: false });
  });

  it("Data URI 自带的类型优先", () => {
    expect(decodeFile("data:text/plain;base64,aGVsbG8=")).toMatchObject({ mime: "text/plain", ext: "txt" });
  });
});

describe("显示", () => {
  it("格式化大小", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });
});
