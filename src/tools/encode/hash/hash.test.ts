import { describe, expect, it } from "vitest";
import { hashText } from "./hash";

describe("哈希计算", () => {
  it("与标准测试向量一致", async () => {
    const r = await hashText("abc");
    expect(r.MD5).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(r["SHA-1"]).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(r["SHA-256"]).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(r["SHA-512"].slice(0, 32)).toBe("ddaf35a193617abacc417349ae204131");
  });

  it("支持中文（按 UTF-8 计算）", async () => {
    expect((await hashText("中文")).MD5).toBe("a7bac2239fcdcb3a067903d8077c4a07");
  });
});
