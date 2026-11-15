import { expect, it } from "vitest";
import { formatStopwatch, Stopwatch } from "./stopwatch";

it("秒表暂停后继续不计入暂停时长，分段记录每段耗时及累计时间", () => {
  const timer = new Stopwatch();
  timer.start(100);
  timer.lap(1100);
  timer.pause(1600);
  expect(timer.elapsed(10000)).toBe(1500);
  timer.lap(10000);
  expect(timer.laps).toHaveLength(1);
  timer.start(12000);
  timer.lap(13000);
  expect(timer.laps).toEqual([{ number: 1, elapsed: 1000, duration: 1000 }, { number: 2, elapsed: 2500, duration: 1500 }]);
  timer.reset();
  expect(timer.elapsed(20000)).toBe(0);
  expect(timer.running).toBe(false);
  expect(timer.laps).toEqual([]);
});

it("不依赖刷新次数；重复启动不会重置基准，超过一小时保持正确显示", () => {
  const timer = new Stopwatch();
  timer.start(100); timer.start(200);
  expect(formatStopwatch(timer.elapsed(3601290))).toBe("01:00:01.19");
  expect(formatStopwatch(0)).toBe("00:00:00.00");
  expect(formatStopwatch(59999)).toBe("00:00:59.99");
});
