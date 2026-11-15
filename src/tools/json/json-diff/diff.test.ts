import { describe, expect, it } from "vitest";
import { diffJson } from "./diff";

describe("diffJson", () => {
  it("列出新增、删除和修改", () => {
    const a = { name: "a", age: 1, tags: ["x"], gone: true };
    const b = { name: "b", age: 1, tags: ["x", "y"], added: { k: 1 } };
    expect(diffJson(a, b)).toEqual([
      { path: "$.name", kind: "changed", before: "a", after: "b" },
      { path: "$.tags[1]", kind: "added", after: "y" },
      { path: "$.gone", kind: "removed", before: true },
      { path: "$.added", kind: "added", after: { k: 1 } },
    ]);
  });

  it("内容相同时没有差异", () => {
    expect(diffJson({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
  });
});
