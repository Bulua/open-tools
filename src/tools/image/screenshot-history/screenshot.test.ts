import { describe, expect, it } from "vitest";
import { groupScreenshots, type ScreenshotItem } from "./screenshot";

const shot = (day: string, hour: string, second: string): ScreenshotItem => ({
  id: `${day}/${hour}/${second}.png`,
  name: `${second}.png`,
  createdAt: `${day} ${hour}:00:${second}`,
  day,
  hour,
});

describe("截图历史分组", () => {
  it("按日期和小时分组，并保留后端返回的时间顺序", () => {
    const groups = groupScreenshots([
      shot("2026-11-08", "15", "20"),
      shot("2026-11-08", "15", "10"),
      shot("2026-11-08", "14", "50"),
      shot("2026-11-07", "23", "30"),
    ]);

    expect(groups.map((group) => group.day)).toEqual(["2026-11-08", "2026-11-07"]);
    expect(groups[0].hours.map((group) => group.hour)).toEqual(["15", "14"]);
    expect(groups[0].hours[0].shots.map((item) => item.id)).toEqual([
      "2026-11-08/15/20.png",
      "2026-11-08/15/10.png",
    ]);
  });
});
