import { describe, expect, it } from "vitest";
import { parseCron } from "./cron";
import { buildCron, convertCron, defaultState, fieldsOf, fillState, modesOf, parseField, updateField, type BuilderState } from "./cronBuilder";
import type { CronDialect } from "./cron";

/** 把表达式拆回选项再生成，应当得到同样的表达式 */
const roundTrip = (expr: string, dialect: CronDialect) => buildCron(fillState(defaultState(), expr, dialect), dialect);

describe("字段和写法跟着方言变化", () => {
  it("字段", () => {
    expect(fieldsOf("unix")).toEqual(["minute", "hour", "day", "month", "week"]);
    expect(fieldsOf("spring")[0]).toBe("second");
    expect(fieldsOf("quartz")).toContain("year");
  });

  it("写法", () => {
    expect(modesOf("day", "unix")).toEqual(["every", "step", "range", "list"]);
    expect(modesOf("day", "spring")).not.toContain("none");
    expect(modesOf("day", "quartz")).toEqual(["every", "none", "step", "range", "list", "last", "nearest", "lastWeekday"]);
    expect(modesOf("week", "quartz")).toContain("nth");
    expect(modesOf("minute", "quartz")).not.toContain("last");
  });
});

describe("生成表达式", () => {
  it("默认是每分钟 / 每秒", () => {
    expect(buildCron(defaultState(), "unix")).toBe("* * * * *");
    expect(buildCron(defaultState(), "spring")).toBe("* * * * * *");
    // Quartz 的周自动写 ?，年省略
    expect(buildCron(defaultState(), "quartz")).toBe("* * * * * ?");
  });

  it("各种写法", () => {
    let s: BuilderState = defaultState();
    s = updateField(s, "minute", { mode: "step", start: 0, step: 15 }, "unix");
    s = updateField(s, "hour", { mode: "range", from: 9, to: 18 }, "unix");
    s = updateField(s, "week", { mode: "list", values: [5, 1, 3] }, "unix");
    expect(buildCron(s, "unix")).toBe("*/15 9-18 * * 1,3,5");
    s = updateField(s, "minute", { mode: "step", start: 5 }, "unix");
    expect(buildCron(s, "unix")).toBe("5/15 9-18 * * 1,3,5");
  });

  it("Quartz 周换算成 1～7，L W #", () => {
    let s = defaultState();
    s = updateField(s, "second", { mode: "list", values: [0] }, "quartz");
    s = updateField(s, "week", { mode: "nth", weekday: 1, nth: 2 }, "quartz");
    expect(buildCron(s, "quartz")).toBe("0 * * ? * 2#2");
    s = updateField(s, "week", { mode: "last", weekday: 5 }, "quartz");
    expect(buildCron(s, "quartz")).toBe("0 * * ? * 6L");
    s = updateField(s, "day", { mode: "nearest", day: 15 }, "quartz");
    expect(buildCron(s, "quartz")).toBe("0 * * 15W * ?");
    s = updateField(s, "day", { mode: "lastWeekday" }, "quartz");
    expect(buildCron(s, "quartz")).toBe("0 * * LW * ?");
    s = updateField(s, "day", { mode: "last", offset: 3 }, "quartz");
    s = updateField(s, "year", { mode: "range", from: 2030, to: 2032 }, "quartz");
    expect(buildCron(s, "quartz")).toBe("0 * * L-3 * ? 2030-2032");
  });

  it("Quartz 的日和周互斥，刚改的那个优先", () => {
    let s = updateField(defaultState(), "day", { mode: "list", values: [1] }, "quartz");
    expect(s.week.mode).toBe("none");
    s = updateField(s, "week", { mode: "range", from: 1, to: 5 }, "quartz");
    expect(s.day.mode).toBe("none");
    expect(buildCron(s, "quartz")).toBe("* * * ? * 2-6");
    // 日改成 ? 时周已经是 ?，周改回 *
    s = updateField(defaultState(), "day", { mode: "none" }, "quartz");
    expect(s.week.mode).toBe("every");
  });

  it("换方言时自动转换", () => {
    // Linux 的工作日 → Quartz：日写 ?，周加 1
    const s = fillState(defaultState(), "0 9 * * 1-5", "unix");
    expect(buildCron(s, "quartz")).toBe("* 0 9 ? * 2-6");
    expect(buildCron(s, "unix")).toBe("0 9 * * 1-5");
    // Quartz 的 ? 到 Linux 变成 *
    const q = fillState(defaultState(), "0 0 12 ? * 2", "quartz");
    expect(buildCron(q, "unix")).toBe("0 12 * * 1");
  });

  it("Linux 转换到带秒的格式时秒写 0", () => {
    expect(convertCron("0 9 * * 1-5", "unix", "spring")).toBe("0 0 9 * * 1-5");
    expect(convertCron("0 18 L * *", "unix", "quartz")).toBe("0 0 18 L * ?");
    expect(convertCron("0 0 12 ? * 2", "quartz", "spring")).toBe("0 0 12 * * 1");
  });

  it("生成的表达式都能解析", () => {
    for (const d of ["unix", "spring", "quartz"] as const) {
      let s = defaultState();
      for (const key of fieldsOf(d)) {
        for (const mode of modesOf(key, d)) {
          s = updateField(s, key, { mode }, d);
          expect(() => parseCron(buildCron(s, d), d), `${d} ${key} ${mode}`).not.toThrow();
        }
      }
    }
  });
});

describe("手写表达式回填", () => {
  it("拆成选项", () => {
    expect(parseField("minute", "*/5", "unix")).toEqual({ mode: "step", start: 0, step: 5 });
    expect(parseField("hour", "9-18", "unix")).toEqual({ mode: "range", from: 9, to: 18 });
    expect(parseField("month", "JAN,MAR", "unix")).toEqual({ mode: "list", values: [1, 3] });
    expect(parseField("week", "MON-FRI", "unix")).toEqual({ mode: "range", from: 1, to: 5 });
    expect(parseField("week", "7", "unix")).toEqual({ mode: "list", values: [0] });
    expect(parseField("week", "1", "quartz")).toEqual({ mode: "list", values: [0] });
    expect(parseField("week", "MON#2", "quartz")).toEqual({ mode: "nth", weekday: 1, nth: 2 });
    expect(parseField("week", "L", "quartz")).toEqual({ mode: "last", weekday: 6 });
    expect(parseField("day", "L-2", "spring")).toEqual({ mode: "last", offset: 2 });
    expect(parseField("day", "?", "quartz")).toEqual({ mode: "none" });
  });

  it("表示不了的写法原样保留", () => {
    expect(parseField("hour", "1-5,10", "unix")).toEqual({ mode: "custom", raw: "1-5,10" });
    expect(parseField("hour", "9-17/2", "unix")).toEqual({ mode: "custom", raw: "9-17/2" });
    // Linux 不显示 L，作为手写保留
    expect(parseField("day", "L", "unix")).toEqual({ mode: "custom", raw: "L" });
    expect(roundTrip("0 9-17/2 L * 1-5", "unix")).toBe("0 9-17/2 L * 1-5");
  });

  it("位数不对时不改动", () => {
    const s = defaultState();
    expect(fillState(s, "* * *", "unix")).toBe(s);
  });

  it("保留没用到的参数", () => {
    let s = fillState(defaultState(), "0 9-18 * * *", "unix");
    s = fillState(s, "0 * * * *", "unix");
    expect(s.hour.mode).toBe("every");
    expect([s.hour.from, s.hour.to]).toEqual([9, 18]);
  });

  it("来回转换不变", () => {
    for (const expr of ["*/15 9-18 * * 1-5", "30 9 1,15 * *", "0 0 1 1 *"]) expect(roundTrip(expr, "unix")).toBe(expr);
    for (const expr of ["0 */5 * * * *", "0 0 12 L * *", "0 0 8 * * 1#2"]) expect(roundTrip(expr, "spring")).toBe(expr);
    for (const expr of ["0 0 12 ? * 2-6", "0 15 10 ? * 6L", "0 0 9 LW * ?", "0 0 9 15W * ? 2030"]) expect(roundTrip(expr, "quartz")).toBe(expr);
  });
});
