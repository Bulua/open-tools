import { describe, expect, it } from "vitest";
import { describeCron, detectDialect, nextRuns, parseCron } from "./cron";

const desc = (expr: string) => describeCron(parseCron(expr));
const runs = (expr: string, from: string, n = 3) => nextRuns(parseCron(expr), new Date(from), n).map((d) => d.toString().slice(4, 24));

describe("识别格式", () => {
  it("按位数和 ? 判断", () => {
    expect(detectDialect("*/5 * * * *")).toBe("unix");
    expect(detectDialect("0 */5 * * * *")).toBe("spring");
    expect(detectDialect("0 0 12 * * ?")).toBe("quartz");
    expect(detectDialect("0 0 12 * * ? 2030")).toBe("quartz");
  });
});

describe("中文说明", () => {
  it("常见写法", () => {
    expect(desc("* * * * *")).toBe("每分钟");
    expect(desc("*/5 * * * *")).toBe("每 5 分钟");
    expect(desc("30 9 * * *")).toBe("每天 09:30");
    expect(desc("0 9 * * 1-5")).toBe("每周一至周五 09:00");
    expect(desc("0 0 1 * *")).toBe("每月 1 日 00:00");
    expect(desc("0 8 1,15 * *")).toBe("每月 1 日、15 日 08:00");
    expect(desc("0 18 L * *")).toBe("每月最后一天 18:00");
    expect(desc("*/15 9-18 * * 1-5")).toBe("每周一至周五 9 点至 18 点，每 15 分钟");
    expect(desc("0 12 * * MON#2")).toBe("每月第 2 个周一 12:00");
    expect(desc("@daily")).toBe("每天 00:00");
    expect(desc("0 0 1 1 *")).toBe("每年 1 月 1 日 00:00");
  });

  it("Spring 与 Quartz", () => {
    expect(desc("0 0 12 * * ?")).toBe("每天 12:00");
    expect(desc("*/10 * * * * *")).toBe("每 10 秒");
    expect(desc("0 15 10 ? * 6L")).toBe("每月最后一个周五 10:15");
  });
});

describe("执行时间", () => {
  it("每 15 分钟", () => {
    expect(runs("*/15 * * * *", "2026-03-02T10:07:00")).toEqual(["Mar 02 2026 10:15:00", "Mar 02 2026 10:30:00", "Mar 02 2026 10:45:00"]);
  });

  it("工作日，跳过周末", () => {
    // 2026-03-06 是周五
    expect(runs("0 9 * * 1-5", "2026-03-06T10:00:00", 2)).toEqual(["Mar 09 2026 09:00:00", "Mar 10 2026 09:00:00"]);
  });

  it("每月最后一天、闰年 2 月 29 日", () => {
    expect(runs("0 0 L * *", "2026-01-31T12:00:00", 2)).toEqual(["Feb 28 2026 00:00:00", "Mar 31 2026 00:00:00"]);
    expect(runs("0 0 29 2 *", "2026-01-01T00:00:00", 1)).toEqual(["Feb 29 2028 00:00:00"]);
  });

  it("Linux：日和周都限制时满足其一", () => {
    // 每月 1 日或周日
    expect(runs("0 0 1 * 0", "2026-03-01T01:00:00", 2)).toEqual(["Mar 08 2026 00:00:00", "Mar 15 2026 00:00:00"]);
  });

  it("Quartz：周 1 是周日，第几个周几", () => {
    expect(runs("0 0 8 ? * 1", "2026-03-02T00:00:00", 1)).toEqual(["Mar 08 2026 08:00:00"]);
    expect(runs("0 0 8 ? * 2#1", "2026-03-03T00:00:00", 1)).toEqual(["Apr 06 2026 08:00:00"]);
  });
});

describe("错误提示", () => {
  it("位数、范围、写法", () => {
    expect(() => parseCron("* * *")).toThrow("需要 5 位");
    expect(() => parseCron("60 * * * *")).toThrow("分「60」超出范围 0～59");
    expect(() => parseCron("0 0 12 * * *", "quartz")).toThrow("必须有一个写 ?");
    expect(() => parseCron("0 0 15W * *")).toThrow("暂不支持 W");
    expect(() => parseCron("a * * * *")).toThrow("不是有效的值");
  });
});
