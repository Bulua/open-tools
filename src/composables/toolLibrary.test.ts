import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./useStoredRef", async () => {
  const { ref } = await import("vue");
  return { useStoredRef: (_key: string, fallback: unknown) => ref(fallback) };
});

import { favoriteToolIds, recentToolIds, rememberRecentTool, recordToolUsage, toggleFavorite, toolActivity, toolIds } from "./toolLibrary";

beforeEach(() => {
  favoriteToolIds.value = [];
  recentToolIds.value = [];
  toolActivity.value = {};
});
afterEach(() => vi.useRealTimers());

it("实际使用跨天分开统计，打开工具和收藏操作不计次数", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 11, 23, 59));
  rememberRecentTool("calendar");
  rememberRecentTool("calendar");
  toggleFavorite("calendar");
  expect(toolActivity.value).toEqual({});
  recordToolUsage();
  recordToolUsage();
  vi.setSystemTime(new Date(2026, 10, 12, 0, 1));
  rememberRecentTool("countdown");
  recordToolUsage();
  expect(toolActivity.value).toEqual({ "2026-11-11": 2, "2026-11-12": 1 });
});

it("损坏的偏好恢复为空列表，有效条目去重并保留顺序", () => {
  expect(toolIds(null)).toEqual([]);
  expect(toolIds({ id: "calendar" })).toEqual([]);
  expect(toolIds(["calendar", null, "", 12, "countdown", "calendar"])).toEqual(["calendar", "countdown"]);
});

it("重新使用工具将其移到首位，保留全部不同工具以便分批展开", () => {
  for (let i = 0; i < 10; i++) rememberRecentTool(`tool-${i}`);
  rememberRecentTool("tool-5");
  expect(recentToolIds.value).toEqual(["tool-5", "tool-9", "tool-8", "tool-7", "tool-6", "tool-4", "tool-3", "tool-2", "tool-1", "tool-0"]);
});

it("收藏和取消收藏不会改变最近使用顺序", () => {
  rememberRecentTool("calendar");
  toggleFavorite("calendar");
  toggleFavorite("countdown");
  toggleFavorite("calendar");
  expect(favoriteToolIds.value).toEqual(["countdown"]);
  expect(recentToolIds.value).toEqual(["calendar"]);
});
