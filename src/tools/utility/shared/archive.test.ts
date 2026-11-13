import { describe, expect, it } from "vitest";
import { gzipSync } from "fflate";
import { buildTree, buildZip, fixZipName, parseTar, readArchive, safeRelativePath } from "./archive";

const text = (s: string) => new TextEncoder().encode(s);

/** 构造一个最简单的 TAR（ustar 格式） */
function makeTar(files: { name: string; content?: string; dir?: boolean }[]) {
  const blocks: Uint8Array[] = [];
  for (const f of files) {
    const data = text(f.content ?? "");
    const header = new Uint8Array(512);
    header.set(text(f.name), 0);
    header.set(text(data.length.toString(8).padStart(11, "0")), 124);
    header[156] = (f.dir ? "5" : "0").charCodeAt(0);
    header.set(text("ustar"), 257);
    blocks.push(header);
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    blocks.push(padded);
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let offset = 0;
  for (const b of blocks) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

describe("fixZipName", () => {
  it("把按 Latin-1 解出的 GBK / UTF-8 文件名还原", () => {
    const gbkBytes = [0xd6, 0xd0, 0xce, 0xc4]; // 「中文」的 GBK 编码
    expect(fixZipName(String.fromCharCode(...gbkBytes) + ".txt")).toBe("中文.txt");
    const utf8Bytes = [...text("报告.pdf")];
    expect(fixZipName(String.fromCharCode(...utf8Bytes))).toBe("报告.pdf");
  });

  it("正常的文件名不变", () => {
    expect(fixZipName("readme.md")).toBe("readme.md");
    expect(fixZipName("已经是中文.txt")).toBe("已经是中文.txt");
  });
});

describe("ZIP", () => {
  it("打包后能原样解压，支持中文路径和目录", () => {
    const zip = buildZip([
      { path: "文档/说明.txt", data: text("你好") },
      { path: "a.txt", data: text("hello") },
    ]);
    const entries = readArchive("x.zip", zip);
    const file = entries.find((e) => e.path === "文档/说明.txt")!;
    expect(new TextDecoder().decode(file.data)).toBe("你好");
    expect(entries.find((e) => e.path === "a.txt")?.size).toBe(5);
  });
});

describe("TAR / TGZ / GZ", () => {
  const tar = makeTar([
    { name: "src/", dir: true },
    { name: "src/main.ts", content: "console.log(1)" },
    { name: "README.md", content: "# hi" },
  ]);

  it("解析 TAR", () => {
    const entries = parseTar(tar);
    expect(entries.map((e) => e.path)).toEqual(["src/", "src/main.ts", "README.md"]);
    expect(new TextDecoder().decode(entries[1].data)).toBe("console.log(1)");
  });

  it("识别 TGZ 与单文件 GZ", () => {
    expect(readArchive("a.tgz", gzipSync(tar))).toHaveLength(3);
    const single = readArchive("data.json.gz", gzipSync(text('{"a":1}')));
    expect(single).toEqual([{ path: "data.json", size: 7, dir: false, data: text('{"a":1}') }]);
  });

  it("不支持的格式给出提示", () => {
    expect(() => readArchive("a.rar", text("Rar!\x1a\x07"))).toThrow("不支持的格式");
  });
});

describe("safeRelativePath", () => {
  it("正常路径保持不变", () => {
    expect(safeRelativePath("docs/img/a.png")).toEqual(["docs", "img", "a.png"]);
  });

  it("去掉试图跳出目标文件夹的部分", () => {
    expect(safeRelativePath("../../Windows/evil.dll")).toEqual(["Windows", "evil.dll"]);
    expect(safeRelativePath("/etc/passwd")).toEqual(["etc", "passwd"]);
    expect(safeRelativePath("C:\\Users\\a\\x.txt")).toEqual(["Users", "a", "x.txt"]);
    expect(safeRelativePath("a/./b/../c.txt")).toEqual(["a", "b", "c.txt"]);
  });

  it("替换 Windows 不允许的字符", () => {
    expect(safeRelativePath('a?b*"c".txt')).toEqual(["a_b__c_.txt"]);
  });
});

describe("buildTree", () => {
  it("整理成目录树，目录在前，目录大小为文件之和", () => {
    const tree = buildTree([
      { path: "b.txt", size: 3, dir: false, data: new Uint8Array() },
      { path: "docs/a.md", size: 10, dir: false, data: new Uint8Array() },
      { path: "docs/img/x.png", size: 5, dir: false, data: new Uint8Array() },
    ]);
    expect(tree.map((n) => n.name)).toEqual(["docs", "b.txt"]);
    expect(tree[0]).toMatchObject({ dir: true, size: 15 });
    expect(tree[0].children.map((n) => n.name)).toEqual(["img", "a.md"]);
  });
});
