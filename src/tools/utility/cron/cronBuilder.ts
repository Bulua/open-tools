/**
 * Cron 生成器：按字段（秒、分、时、日、月、周、年）选择写法，生成表达式；
 * 也能把手写的表达式反向拆回各字段的选项，两边保持同步。
 *
 * 周在这里统一用 0～6（0 是周日），生成时再按方言换算（Quartz 是 1～7）。
 */
import { MONTHS, WEEKDAYS, type CronDialect } from "./cron";

export type FieldKey = "second" | "minute" | "hour" | "day" | "month" | "week" | "year";

/**
 * 每个字段的写法：
 * - every：*；none：?（Quartz 的日或周）
 * - step：从 start 开始每 step；range：from 到 to；list：指定的几个值
 * - last：日的 L / L-n，周的「最后一个周几」nL
 * - nearest：日的 nW（离这天最近的工作日）；lastWeekday：日的 LW（最后一个工作日）
 * - nth：周的 n#k（第 k 个周几）
 * - custom：上面都表示不了的手写内容，原样保留在 raw
 */
export type FieldMode = "every" | "none" | "step" | "range" | "list" | "last" | "nearest" | "lastWeekday" | "nth" | "custom";

export interface FieldState {
  mode: FieldMode;
  start: number;
  step: number;
  from: number;
  to: number;
  values: number[];
  /** 日 L-n 的 n */
  offset: number;
  /** 日 nW 的 n */
  day: number;
  /** 周 nL、n#k 的周几（0～6） */
  weekday: number;
  /** 周 n#k 的 k（1～5） */
  nth: number;
  raw: string;
}

export type BuilderState = Record<FieldKey, FieldState>;

/** 各字段的取值范围（周是 0～6） */
export const FIELD_RANGE: Record<FieldKey, [number, number]> = {
  second: [0, 59],
  minute: [0, 59],
  hour: [0, 23],
  day: [1, 31],
  month: [1, 12],
  week: [0, 6],
  year: [1970, 2099],
};

/** 当前方言有哪些字段，按表达式里的顺序 */
export function fieldsOf(dialect: CronDialect): FieldKey[] {
  if (dialect === "unix") return ["minute", "hour", "day", "month", "week"];
  if (dialect === "spring") return ["second", "minute", "hour", "day", "month", "week"];
  return ["second", "minute", "hour", "day", "month", "week", "year"];
}

/** 当前方言下，这个字段能用哪些写法 */
export function modesOf(key: FieldKey, dialect: CronDialect): FieldMode[] {
  const base: FieldMode[] = ["every", "step", "range", "list"];
  // Linux 只有基本写法；L、W、# 是 Spring 和 Quartz 的扩展，? 只有 Quartz 要求写
  const extended = dialect !== "unix";
  const none: FieldMode[] = dialect === "quartz" ? ["none"] : [];
  if (key === "day") return [...base.slice(0, 1), ...none, ...base.slice(1), ...(extended ? (["last", "nearest", "lastWeekday"] as FieldMode[]) : [])];
  if (key === "week") return [...base.slice(0, 1), ...none, ...base.slice(1), ...(extended ? (["nth", "last"] as FieldMode[]) : [])];
  return base;
}

function defaultField(key: FieldKey): FieldState {
  const [min, max] = FIELD_RANGE[key];
  const year = new Date().getFullYear();
  const presets: Partial<Record<FieldKey, Partial<FieldState>>> = {
    hour: { from: 9, to: 18 },
    day: { from: 1, to: 15, day: 15 },
    month: { from: 1, to: 6 },
    week: { from: 1, to: 5, values: [1], weekday: 1 },
    year: { start: year, from: year, to: year + 1, values: [year] },
  };
  return { mode: "every", start: min, step: key === "year" ? 1 : key === "hour" ? 2 : 5, from: min, to: max, values: [min], offset: 0, day: 1, weekday: 1, nth: 1, raw: "", ...presets[key] };
}

export function defaultState(): BuilderState {
  const keys: FieldKey[] = ["second", "minute", "hour", "day", "month", "week", "year"];
  return Object.fromEntries(keys.map((k) => [k, defaultField(k)])) as BuilderState;
}

// ---------- 生成 ----------

/** 周在表达式里的写法：Quartz 1～7，其他 0～6 */
const weekOut = (v: number, dialect: CronDialect) => (dialect === "quartz" ? v + 1 : v);

/** 生成一个字段的写法 */
export function buildField(key: FieldKey, f: FieldState, dialect: CronDialect): string {
  const [min] = FIELD_RANGE[key];
  const out = (v: number) => String(key === "week" ? weekOut(v, dialect) : v);
  switch (f.mode) {
    case "every":
      return "*";
    case "none":
      return dialect === "quartz" ? "?" : "*";
    case "step":
      return `${f.start === min ? "*" : out(f.start)}/${Math.max(1, f.step)}`;
    case "range":
      return `${out(Math.min(f.from, f.to))}-${out(Math.max(f.from, f.to))}`;
    case "list":
      return f.values.length ? [...new Set(f.values)].sort((a, b) => a - b).map(out).join(",") : "*";
    case "last":
      if (key === "week") return `${out(f.weekday)}L`;
      return f.offset ? `L-${f.offset}` : "L";
    case "nearest":
      return `${f.day}W`;
    case "lastWeekday":
      return "LW";
    case "nth":
      return `${out(f.weekday)}#${f.nth}`;
    case "custom":
      return f.raw || "*";
  }
}

const restricted = (f: FieldState) => f.mode !== "every" && f.mode !== "none";

/** 生成整个表达式；Quartz 里日和周必须有一个是 ?，这里会自动补上 */
export function buildCron(state: BuilderState, dialect: CronDialect): string {
  const s = { ...state };
  if (dialect === "quartz") {
    const { day, week } = s;
    if (day.mode === "none" && week.mode === "none") s.week = { ...week, mode: "every" };
    else if (day.mode !== "none" && week.mode !== "none") {
      // 只有周有限制时，日写 ?；否则周写 ?
      if (restricted(week) && !restricted(day)) s.day = { ...day, mode: "none" };
      else s.week = { ...week, mode: "none" };
    }
  }
  const parts = fieldsOf(dialect).map((k) => buildField(k, s[k], dialect));
  // 年不限制时省略，Quartz 的年本来就是可选的
  if (dialect === "quartz" && parts[6] === "*") parts.pop();
  return parts.join(" ");
}

/**
 * 修改一个字段。Quartz 的日和周互斥：刚改的那个有值时，另一个写 ?；
 * 两个都成了 ? 时，另一个改回 *。
 */
export function updateField(state: BuilderState, key: FieldKey, patch: Partial<FieldState>, dialect: CronDialect): BuilderState {
  const next = { ...state, [key]: { ...state[key], ...patch } };
  if (dialect !== "quartz" || (key !== "day" && key !== "week")) return next;
  const other = key === "day" ? "week" : "day";
  if (next[key].mode !== "none" && next[other].mode !== "none") next[other] = { ...next[other], mode: "none" };
  else if (next[key].mode === "none" && next[other].mode === "none") next[other] = { ...next[other], mode: "every" };
  return next;
}

// ---------- 反向拆解 ----------

/** 把一个值（数字或英文缩写）换成数字；周换成 0～6。不合法时返回 null */
function valueOf(key: FieldKey, text: string, dialect: CronDialect): number | null {
  const upper = text.toUpperCase();
  let n: number;
  if (key === "month" && MONTHS.includes(upper)) n = MONTHS.indexOf(upper) + 1;
  else if (key === "week" && WEEKDAYS.includes(upper)) return WEEKDAYS.indexOf(upper);
  else if (/^\d+$/.test(text)) n = Number(text);
  else return null;
  if (key === "week") {
    if (dialect === "quartz") return n >= 1 && n <= 7 ? n - 1 : null;
    return n >= 0 && n <= 7 ? n % 7 : null;
  }
  const [min, max] = FIELD_RANGE[key];
  return n >= min && n <= max ? n : null;
}

/** 把一个字段的写法拆成选项；表示不了的返回 custom */
export function parseField(key: FieldKey, text: string, dialect: CronDialect): Partial<FieldState> & { mode: FieldMode } {
  const custom = { mode: "custom" as const, raw: text };
  const val = (s: string) => valueOf(key, s, dialect);
  let result: (Partial<FieldState> & { mode: FieldMode }) | null = null;

  if (text === "*") result = { mode: "every" };
  else if (text === "?") result = { mode: dialect === "quartz" && (key === "day" || key === "week") ? "none" : "every" };
  else if (key === "day" && /^L(-\d+)?$/i.test(text)) result = { mode: "last", offset: Number(text.slice(2) || 0) };
  else if (key === "day" && /^LW$/i.test(text)) result = { mode: "lastWeekday" };
  else if (key === "day" && /^\d+W$/i.test(text)) {
    const d = val(text.slice(0, -1));
    if (d !== null) result = { mode: "nearest", day: d };
  } else if (key === "week" && /^\w+#[1-5]$/.test(text)) {
    const [w, k] = text.split("#");
    const v = val(w);
    if (v !== null) result = { mode: "nth", weekday: v, nth: Number(k) };
  } else if (key === "week" && /^\w*L$/i.test(text)) {
    // 单独的 L 表示周六
    const v = text.length === 1 ? 6 : val(text.slice(0, -1));
    if (v !== null) result = { mode: "last", weekday: v };
  } else {
    const step = text.match(/^(\*|\w+)\/(\d+)$/);
    const span = text.match(/^(\w+)-(\w+)$/);
    if (step) {
      const start = step[1] === "*" ? FIELD_RANGE[key][0] : val(step[1]);
      if (start !== null && Number(step[2]) > 0) result = { mode: "step", start, step: Number(step[2]) };
    } else if (span) {
      // 周的「1-7」里 7 是周日，换算后终点小于起点，这种写法按手写保留
      const from = val(span[1]);
      const to = val(span[2]);
      if (from !== null && to !== null && from <= to) result = { mode: "range", from, to };
    } else if (/^\w+(,\w+)*$/.test(text)) {
      const values = text.split(",").map(val);
      if (values.every((v) => v !== null)) result = { mode: "list", values: [...new Set(values as number[])].sort((a, b) => a - b) };
    }
  }
  if (!result || !modesOf(key, dialect).includes(result.mode)) return custom;
  return result;
}

/**
 * 把手写的表达式拆回各字段，合并进现有的选项（没用到的写法保留原来的参数，
 * 切换写法时不会丢）。位数不对时原样返回。
 */
export function fillState(state: BuilderState, expr: string, dialect: CronDialect): BuilderState {
  const parts = expr.trim().split(/\s+/);
  const keys = fieldsOf(dialect);
  const optionalYear = dialect === "quartz" && parts.length === keys.length - 1;
  if (parts.length !== keys.length && !optionalYear) return state;
  const next = { ...state };
  keys.forEach((k, i) => {
    const text = parts[i] ?? "*";
    next[k] = { ...state[k], ...parseField(k, text, dialect) };
  });
  return next;
}

/** 把表达式从一种格式转换成另一种；Linux 没有秒，转换到带秒的格式时秒写 0 */
export function convertCron(expr: string, from: CronDialect, to: CronDialect): string {
  let s = fillState(defaultState(), expr, from);
  if (from === "unix") s = { ...s, second: { ...s.second, mode: "list", values: [0] } };
  return buildCron(s, to);
}
