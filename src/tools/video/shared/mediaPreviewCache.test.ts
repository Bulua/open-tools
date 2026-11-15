import { afterEach, expect, it, vi } from "vitest";
import { createMediaPreviewCache } from "./mediaPreviewCache";

afterEach(() => vi.restoreAllMocks());
it("限制缓存大小，重复访问刷新顺序，并在清空时回收 Blob", () => {
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:a").mockReturnValueOnce("blob:b").mockReturnValueOnce("blob:c");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const cache = createMediaPreviewCache(10, 2);
  cache.put("a", new Uint8Array(4), "image/webp");
  cache.put("b", new Uint8Array(4), "image/webp");
  expect(cache.get("a")).toBe("blob:a");
  cache.put("c", new Uint8Array(4), "image/webp");
  expect(cache.get("b")).toBeUndefined();
  expect(revoke).toHaveBeenCalledWith("blob:b");
  cache.clear();
  expect(create).toHaveBeenCalledTimes(3);
  expect(revoke).toHaveBeenCalledTimes(3);
});
