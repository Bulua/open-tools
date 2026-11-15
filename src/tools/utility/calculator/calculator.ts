/**
 * 计算器的表达式求值（自己解析，不使用 eval，安全且可控）。
 *
 * 支持：+ - × ÷ * /、^ 乘方、mod 取余、% 百分号（50% = 0.5）、! 阶乘、括号
 *      函数 sqrt √ sin cos tan asin acos atan log ln abs exp、常量 π pi e
 *      省略乘号：2π、2(3+4)、(1+2)(3+4)
 */
// 文件里 t 常用作 token 变量名，文案函数改名为 i18n
import { t as i18n } from "@/locales";
export type AngleUnit = "deg" | "rad";

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: string }
  | { type: "name"; value: string }
  | { type: "paren"; value: "(" | ")" };

const FUNCTIONS = ["sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "log", "ln", "abs", "exp"];
const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };

function tokenize(input: string): Token[] {
  const s = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/√/g, " sqrt ").replace(/，/g, ",");
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[\d.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i))!;
      if (!m) throw new Error(i18n("utility.badNumber"));
      tokens.push({ type: "num", value: Number(m[0]) });
      i += m[0].length;
    } else if ("+-*/^%!".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
    } else if (/[a-zπ]/i.test(ch)) {
      const name = /^(π|[a-z]+)/i.exec(s.slice(i))![0].toLowerCase();
      if (!FUNCTIONS.includes(name) && !(name in CONSTANTS) && name !== "mod") throw new Error(i18n("utility.unknownName", { name }));
      tokens.push(name === "mod" ? { type: "op", value: "mod" } : { type: "name", value: name });
      i += name.length;
    } else {
      throw new Error(i18n("utility.unknownSymbol", { ch }));
    }
  }
  return tokens;
}

const factorial = (n: number) => {
  if (!Number.isInteger(n) || n < 0) throw new Error(i18n("utility.factorial"));
  if (n > 170) return Infinity;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
};

export function evaluate(input: string, angle: AngleUnit = "deg"): number {
  const tokens = tokenize(input);
  if (!tokens.length) throw new Error(i18n("utility.needExpr"));
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const toRad = (x: number) => (angle === "deg" ? (x * Math.PI) / 180 : x);
  const fromRad = (x: number) => (angle === "deg" ? (x * 180) / Math.PI : x);

  // 能作为一个因子开头的记号（用于判断省略乘号）
  const startsFactor = (t?: Token) => !!t && (t.type === "num" || t.type === "name" || (t.type === "paren" && t.value === "("));

  const expression = (): number => {
    let v = term();
    while (peek()?.type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = next().value;
      v = op === "+" ? v + term() : v - term();
    }
    return v;
  };

  const term = (): number => {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t?.type === "op" && (t.value === "*" || t.value === "/" || t.value === "mod")) {
        next();
        const r = unary();
        if (t.value === "/" && r === 0) throw new Error(i18n("utility.divZero"));
        v = t.value === "*" ? v * r : t.value === "/" ? v / r : v % r;
      } else if (startsFactor(t)) {
        v *= unary(); // 省略乘号
      } else {
        return v;
      }
    }
  };

  const unary = (): number => {
    const t = peek();
    if (t?.type === "op" && (t.value === "-" || t.value === "+")) {
      next();
      return t.value === "-" ? -unary() : unary();
    }
    return power();
  };

  // 乘方右结合：2^3^2 = 2^9；且优先级高于负号：-2^2 = -4
  const power = (): number => {
    const base = postfix();
    if (peek()?.type === "op" && peek().value === "^") {
      next();
      return Math.pow(base, unary());
    }
    return base;
  };

  const postfix = (): number => {
    let v = primary();
    while (peek()?.type === "op" && (peek().value === "!" || peek().value === "%")) {
      v = next().value === "!" ? factorial(v) : v / 100;
    }
    return v;
  };

  const primary = (): number => {
    const t = next();
    if (!t) throw new Error(i18n("utility.incomplete"));
    if (t.type === "num") return t.value;
    if (t.type === "paren" && t.value === "(") {
      const v = expression();
      // 允许省略最后的右括号
      if (peek()?.type === "paren" && peek().value === ")") next();
      return v;
    }
    if (t.type === "name") {
      if (t.value in CONSTANTS) return CONSTANTS[t.value];
      // 函数参数：sqrt 9、sin(30)、√-4；函数比 ^ 结合更紧，sin(30)^2 = (sin 30)²
      const negative = peek()?.type === "op" && peek().value === "-" && !!next();
      const x = negative ? -postfix() : postfix();
      switch (t.value) {
        case "sqrt":
          if (x < 0) throw new Error(i18n("utility.negSqrt"));
          return Math.sqrt(x);
        case "sin":
          return Math.sin(toRad(x));
        case "cos":
          return Math.cos(toRad(x));
        case "tan":
          return Math.tan(toRad(x));
        case "asin":
          return fromRad(Math.asin(x));
        case "acos":
          return fromRad(Math.acos(x));
        case "atan":
          return fromRad(Math.atan(x));
        case "log":
          return Math.log10(x);
        case "ln":
          return Math.log(x);
        case "abs":
          return Math.abs(x);
        case "exp":
          return Math.exp(x);
      }
    }
    throw new Error(i18n("utility.incomplete"));
  };

  const result = expression();
  if (pos < tokens.length) throw new Error(peek().type === "paren" ? i18n("utility.parenMismatch") : i18n("utility.extraContent"));
  return result;
}

/** 显示结果：12 位有效数字，消除 0.1+0.2 这类浮点误差 */
export function formatResult(n: number): string {
  if (Number.isNaN(n)) return i18n("utility.invalidResult");
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  const abs = Math.abs(n);
  // 三角函数的 1e-17 这类误差视为 0（要在科学计数法判断之前）
  if (abs < 1e-12) return "0";
  if (abs >= 1e15 || abs < 1e-9) return n.toExponential(10).replace(/\.?0+e/, "e");
  return String(Number(n.toPrecision(12)));
}
