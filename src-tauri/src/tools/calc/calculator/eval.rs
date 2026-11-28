//! 科学计算器递归下降表达式求值器（无 eval，安全可控），供界面与 AI 工具共用。
//!
//! 支持：
//! - 运算符：`+` `-` `*` `/` `//`（整除）`×` `÷` `^`（右结合，优先级高于负号）、`mod`、`%`（百分号）、`!`（阶乘）、括号
//! - 单参函数：`sqrt` `√` `cbrt` `∛` `sin` `cos` `tan` `asin` `acos` `atan` `sinh` `cosh` `tanh` `asinh` `acosh` `atanh` `log` `log10` `log2` `ln` `abs` `exp` `floor` `ceil` `round` `trunc` `sign` `deg` `rad`
//! - 多参函数：`pow(x, y)` `logn(base, x)` `root(n, x)` `hypot(...)` `min(...)` `max(...)` `avg(...)` `sum(...)` `gcd(...)` `lcm(...)` `ncr(n, k)` `npr(n, k)`
//! - 常量：`π` `pi` `τ` `tau` `e` `φ` `phi`
//! - 省略乘号：`2π`、`2(3+4)`、`(1+2)(3+4)`

use std::f64::consts::{E, PI, TAU};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AngleUnit {
    Deg,
    Rad,
}

impl AngleUnit {
    pub(crate) fn parse(raw: Option<&str>) -> Result<Self, String> {
        match raw.map(str::trim).filter(|s| !s.is_empty()) {
            None => Ok(Self::Deg),
            Some(s) if s.eq_ignore_ascii_case("deg") => Ok(Self::Deg),
            Some(s) if s.eq_ignore_ascii_case("rad") => Ok(Self::Rad),
            Some(other) => Err(format!("Unsupported angle unit '{other}'. Expected 'deg' or 'rad'.")),
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Deg => "deg",
            Self::Rad => "rad",
        }
    }
}

/// 结构化求值错误：携带与前端 `utility.*` 文案对应的错误码，便于前端本地化展示与 AI 理解。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EvalError {
    pub(crate) code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) detail: Option<String>,
    pub(crate) message: String,
}

impl EvalError {
    fn simple(code: &'static str, message: &'static str) -> Self {
        Self {
            code,
            detail: None,
            message: message.to_string(),
        }
    }

    fn with_detail(code: &'static str, detail: impl Into<String>, message: String) -> Self {
        Self {
            code,
            detail: Some(detail.into()),
            message,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EvalResult {
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) formatted: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<EvalError>,
}

impl EvalResult {
    fn ok(value: f64, formatted: String) -> Self {
        Self {
            ok: true,
            value: if value.is_finite() { Some(value) } else { None },
            formatted: Some(formatted),
            error: None,
        }
    }

    fn err(error: EvalError) -> Self {
        Self {
            ok: false,
            value: None,
            formatted: None,
            error: Some(error),
        }
    }
}

#[derive(Debug, Clone)]
enum Token {
    Num(f64),
    Op(String),
    Name(String),
    LParen,
    RParen,
    Comma,
}

const UNARY_FUNCTIONS: &[&str] = &[
    "sqrt", "cbrt", "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh",
    "asinh", "acosh", "atanh", "log", "log10", "log2", "ln", "abs", "exp", "floor", "ceil",
    "round", "trunc", "sign", "deg", "rad",
];

const MULTI_FUNCTIONS: &[&str] = &[
    "pow", "logn", "root", "hypot", "min", "max", "avg", "sum", "gcd", "lcm", "ncr", "npr",
];

fn lookup_constant(name: &str) -> Option<f64> {
    match name {
        "pi" | "π" => Some(PI),
        "tau" | "τ" => Some(TAU),
        "e" => Some(E),
        "phi" | "φ" => Some((1.0 + 5.0_f64.sqrt()) / 2.0),
        _ => None,
    }
}

fn tokenize(input: &str) -> Result<Vec<Token>, EvalError> {
    let normalized = input
        .replace('×', "*")
        .replace('÷', "/")
        .replace('−', "-")
        .replace('√', " sqrt ")
        .replace('∛', " cbrt ")
        .replace('，', ",");
    let chars: Vec<char> = normalized.chars().collect();
    let len = chars.len();
    let mut tokens = Vec::new();
    let mut i = 0;

    while i < len {
        let ch = chars[i];
        if ch.is_whitespace() {
            i += 1;
            continue;
        }
        if ch.is_ascii_digit() || ch == '.' {
            let start = i;
            let mut has_digit = false;
            while i < len && chars[i].is_ascii_digit() {
                has_digit = true;
                i += 1;
            }
            if i < len && chars[i] == '.' {
                i += 1;
                while i < len && chars[i].is_ascii_digit() {
                    has_digit = true;
                    i += 1;
                }
            }
            if !has_digit {
                return Err(EvalError::simple("badNumber", "Invalid number format."));
            }
            // 可选科学计数法指数部分：e[+-]?\d+
            if i < len && (chars[i] == 'e' || chars[i] == 'E') {
                let exp_mark = i;
                let mut j = i + 1;
                if j < len && (chars[j] == '+' || chars[j] == '-') {
                    j += 1;
                }
                let digit_start = j;
                while j < len && chars[j].is_ascii_digit() {
                    j += 1;
                }
                if j > digit_start {
                    i = j;
                } else {
                    // 例如 `2e` 表示 `2 * e`（省略乘号），不要吃掉 `e`
                    i = exp_mark;
                }
            }
            let slice: String = chars[start..i].iter().collect();
            let value = slice
                .parse::<f64>()
                .map_err(|_| EvalError::simple("badNumber", "Invalid number format."))?;
            tokens.push(Token::Num(value));
            continue;
        }
        if ch == '/' && i + 1 < len && chars[i + 1] == '/' {
            tokens.push(Token::Op("//".to_string()));
            i += 2;
            continue;
        }
        if "+-*/^%!".contains(ch) {
            tokens.push(Token::Op(ch.to_string()));
            i += 1;
            continue;
        }
        if ch == '(' {
            tokens.push(Token::LParen);
            i += 1;
            continue;
        }
        if ch == ')' {
            tokens.push(Token::RParen);
            i += 1;
            continue;
        }
        if ch == ',' {
            tokens.push(Token::Comma);
            i += 1;
            continue;
        }
        if ch == 'π' || ch == 'Π' {
            tokens.push(Token::Name("π".to_string()));
            i += 1;
            continue;
        }
        if ch == 'τ' || ch == 'Τ' {
            tokens.push(Token::Name("τ".to_string()));
            i += 1;
            continue;
        }
        if ch == 'φ' || ch == 'Φ' {
            tokens.push(Token::Name("φ".to_string()));
            i += 1;
            continue;
        }
        if ch.is_ascii_alphabetic() {
            let start = i;
            i += 1;
            while i < len && chars[i].is_ascii_alphanumeric() {
                i += 1;
            }
            let name: String = chars[start..i].iter().collect::<String>().to_ascii_lowercase();
            if name == "mod" {
                tokens.push(Token::Op("mod".to_string()));
            } else if UNARY_FUNCTIONS.contains(&name.as_str())
                || MULTI_FUNCTIONS.contains(&name.as_str())
                || lookup_constant(&name).is_some()
            {
                tokens.push(Token::Name(name));
            } else {
                return Err(EvalError::with_detail(
                    "unknownName",
                    name.clone(),
                    format!("Unknown function or constant: '{name}'."),
                ));
            }
            continue;
        }

        let symbol = ch.to_string();
        return Err(EvalError::with_detail(
            "unknownSymbol",
            symbol.clone(),
            format!("Unsupported symbol: '{symbol}'."),
        ));
    }

    Ok(tokens)
}

fn factorial(n: f64) -> Result<f64, EvalError> {
    if !n.is_finite() || n < 0.0 || n.fract() != 0.0 {
        return Err(EvalError::simple(
            "factorial",
            "Factorial requires a non-negative integer.",
        ));
    }
    if n > 170.0 {
        return Ok(f64::INFINITY);
    }
    let count = n as u32;
    let mut result = 1.0_f64;
    for k in 2..=count {
        result *= f64::from(k);
    }
    Ok(result)
}

fn as_exact_i64(n: f64) -> Result<i64, EvalError> {
    if !n.is_finite() || n.fract() != 0.0 || n.abs() > 9_007_199_254_740_991.0 {
        return Err(EvalError::simple(
            "invalidResult",
            "Integer argument out of exact range.",
        ));
    }
    Ok(n as i64)
}

fn gcd_u64(mut a: u64, mut b: u64) -> u64 {
    while b != 0 {
        let r = a % b;
        a = b;
        b = r;
    }
    a
}

fn combinations(n: f64, k: f64) -> Result<f64, EvalError> {
    let ni = as_exact_i64(n)?;
    let ki = as_exact_i64(k)?;
    if ni < 0 || ki < 0 {
        return Err(EvalError::simple(
            "factorial",
            "Combinatorics arguments must be non-negative integers.",
        ));
    }
    if ki > ni {
        return Ok(0.0);
    }
    let m = ki.min(ni - ki) as u64;
    let nu = ni as u64;
    let mut res = 1.0_f64;
    for i in 1..=m {
        res = res * ((nu - m + i) as f64) / (i as f64);
    }
    Ok(res.round())
}

fn permutations(n: f64, k: f64) -> Result<f64, EvalError> {
    let ni = as_exact_i64(n)?;
    let ki = as_exact_i64(k)?;
    if ni < 0 || ki < 0 {
        return Err(EvalError::simple(
            "factorial",
            "Combinatorics arguments must be non-negative integers.",
        ));
    }
    if ki > ni {
        return Ok(0.0);
    }
    let mut res = 1.0_f64;
    for i in 0..(ki as u64) {
        res *= (ni as u64 - i) as f64;
    }
    Ok(res)
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
    angle: AngleUnit,
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn next(&mut self) -> Option<Token> {
        if self.pos < self.tokens.len() {
            let token = self.tokens[self.pos].clone();
            self.pos += 1;
            Some(token)
        } else {
            None
        }
    }

    fn to_rad(&self, x: f64) -> f64 {
        match self.angle {
            AngleUnit::Deg => x * PI / 180.0,
            AngleUnit::Rad => x,
        }
    }

    fn from_rad(&self, x: f64) -> f64 {
        match self.angle {
            AngleUnit::Deg => x * 180.0 / PI,
            AngleUnit::Rad => x,
        }
    }

    fn starts_factor(token: Option<&Token>) -> bool {
        matches!(
            token,
            Some(Token::Num(_) | Token::Name(_) | Token::LParen)
        )
    }

    fn expression(&mut self) -> Result<f64, EvalError> {
        let mut v = self.term()?;
        while let Some(Token::Op(op)) = self.peek() {
            if op == "+" || op == "-" {
                let is_add = op == "+";
                self.next();
                let rhs = self.term()?;
                v = if is_add { v + rhs } else { v - rhs };
            } else {
                break;
            }
        }
        Ok(v)
    }

    fn term(&mut self) -> Result<f64, EvalError> {
        let mut v = self.unary()?;
        loop {
            match self.peek() {
                Some(Token::Op(op)) if op == "*" || op == "/" || op == "//" || op == "mod" => {
                    let op = op.clone();
                    self.next();
                    let rhs = self.unary()?;
                    if (op == "/" || op == "//" || op == "mod") && rhs == 0.0 {
                        return Err(EvalError::simple("divZero", "Division by zero."));
                    }
                    v = match op.as_str() {
                        "*" => v * rhs,
                        "/" => v / rhs,
                        "//" => (v / rhs).floor(),
                        _ => v % rhs,
                    };
                }
                token if Self::starts_factor(token) => {
                    v *= self.unary()?;
                }
                _ => return Ok(v),
            }
        }
    }

    fn unary(&mut self) -> Result<f64, EvalError> {
        if let Some(Token::Op(op)) = self.peek() {
            if op == "-" || op == "+" {
                let is_neg = op == "-";
                self.next();
                let inner = self.unary()?;
                return Ok(if is_neg { -inner } else { inner });
            }
        }
        self.power()
    }

    /// 乘方右结合：`2^3^2 = 2^9`；优先级高于一元负号：`-2^2 = -4`。
    fn power(&mut self) -> Result<f64, EvalError> {
        let base = self.postfix()?;
        if matches!(self.peek(), Some(Token::Op(op)) if op == "^") {
            self.next();
            let exp = self.unary()?;
            return Ok(base.powf(exp));
        }
        Ok(base)
    }

    fn postfix(&mut self) -> Result<f64, EvalError> {
        let mut v = self.primary()?;
        while let Some(Token::Op(op)) = self.peek() {
            if op == "!" || op == "%" {
                let is_fact = op == "!";
                self.next();
                v = if is_fact { factorial(v)? } else { v / 100.0 };
            } else {
                break;
            }
        }
        Ok(v)
    }

    fn parse_call_args(&mut self) -> Result<Vec<f64>, EvalError> {
        self.next(); // consume '('
        if self.peek().is_none() || matches!(self.peek(), Some(Token::RParen)) {
            return Err(EvalError::simple("incomplete", "Incomplete expression."));
        }
        let mut args = vec![self.expression()?];
        while matches!(self.peek(), Some(Token::Comma)) {
            self.next();
            if self.peek().is_none() || matches!(self.peek(), Some(Token::RParen)) {
                return Err(EvalError::simple("incomplete", "Incomplete expression."));
            }
            args.push(self.expression()?);
        }
        if matches!(self.peek(), Some(Token::RParen)) {
            self.next();
        }
        Ok(args)
    }

    fn eval_unary(&self, name: &str, x: f64) -> Result<f64, EvalError> {
        match name {
            "sqrt" => {
                if x < 0.0 {
                    return Err(EvalError::simple(
                        "negSqrt",
                        "Cannot take square root of a negative number.",
                    ));
                }
                Ok(x.sqrt())
            }
            "cbrt" => Ok(x.cbrt()),
            "sin" => Ok(self.to_rad(x).sin()),
            "cos" => Ok(self.to_rad(x).cos()),
            "tan" => Ok(self.to_rad(x).tan()),
            "asin" => Ok(self.from_rad(x.asin())),
            "acos" => Ok(self.from_rad(x.acos())),
            "atan" => Ok(self.from_rad(x.atan())),
            "sinh" => Ok(x.sinh()),
            "cosh" => Ok(x.cosh()),
            "tanh" => Ok(x.tanh()),
            "asinh" => Ok(x.asinh()),
            "acosh" => Ok(x.acosh()),
            "atanh" => Ok(x.atanh()),
            "log" | "log10" => Ok(x.log10()),
            "log2" => Ok(x.log2()),
            "ln" => Ok(x.ln()),
            "abs" => Ok(x.abs()),
            "exp" => Ok(x.exp()),
            "floor" => Ok(x.floor()),
            "ceil" => Ok(x.ceil()),
            "round" => Ok(x.round()),
            "trunc" => Ok(x.trunc()),
            "sign" => Ok(if x > 0.0 {
                1.0
            } else if x < 0.0 {
                -1.0
            } else {
                0.0
            }),
            "deg" => Ok(x * 180.0 / PI),
            "rad" => Ok(x * PI / 180.0),
            _ => Err(EvalError::simple("incomplete", "Incomplete expression.")),
        }
    }

    fn eval_multi(&self, name: &str, args: &[f64]) -> Result<f64, EvalError> {
        match name {
            "pow" => {
                if args.len() != 2 {
                    return Err(EvalError::simple("incomplete", "pow expects 2 arguments."));
                }
                Ok(args[0].powf(args[1]))
            }
            "logn" => {
                if args.len() != 2 {
                    return Err(EvalError::simple("incomplete", "logn expects 2 arguments."));
                }
                Ok(args[1].log(args[0]))
            }
            "root" => {
                if args.len() != 2 {
                    return Err(EvalError::simple("incomplete", "root expects 2 arguments."));
                }
                let (n, x) = (args[0], args[1]);
                if n == 0.0 {
                    return Err(EvalError::simple("divZero", "Division by zero."));
                }
                if x < 0.0 {
                    if n.fract() == 0.0 && (n as i64).abs() % 2 == 1 {
                        Ok(-(-x).powf(1.0 / n))
                    } else {
                        Err(EvalError::simple(
                            "negSqrt",
                            "Cannot take even root of a negative number.",
                        ))
                    }
                } else {
                    Ok(x.powf(1.0 / n))
                }
            }
            "hypot" => {
                if args.len() < 2 {
                    return Err(EvalError::simple("incomplete", "hypot expects at least 2 arguments."));
                }
                Ok(args.iter().fold(0.0_f64, |acc, &v| acc.hypot(v)))
            }
            "min" => Ok(args.iter().copied().fold(f64::INFINITY, f64::min)),
            "max" => Ok(args.iter().copied().fold(f64::NEG_INFINITY, f64::max)),
            "sum" => Ok(args.iter().sum()),
            "avg" => Ok(args.iter().sum::<f64>() / (args.len() as f64)),
            "gcd" => {
                if args.len() < 2 {
                    return Err(EvalError::simple("incomplete", "gcd expects at least 2 arguments."));
                }
                let mut acc = as_exact_i64(args[0])?.unsigned_abs();
                for &v in &args[1..] {
                    acc = gcd_u64(acc, as_exact_i64(v)?.unsigned_abs());
                }
                Ok(acc as f64)
            }
            "lcm" => {
                if args.len() < 2 {
                    return Err(EvalError::simple("incomplete", "lcm expects at least 2 arguments."));
                }
                let mut acc = as_exact_i64(args[0])?.unsigned_abs() as u128;
                for &v in &args[1..] {
                    let b = as_exact_i64(v)?.unsigned_abs() as u128;
                    if acc == 0 || b == 0 {
                        acc = 0;
                    } else {
                        let g = gcd_u64(acc as u64, b as u64) as u128;
                        acc = (acc / g).saturating_mul(b);
                    }
                }
                Ok(acc as f64)
            }
            "ncr" => {
                if args.len() != 2 {
                    return Err(EvalError::simple("incomplete", "ncr expects 2 arguments."));
                }
                combinations(args[0], args[1])
            }
            "npr" => {
                if args.len() != 2 {
                    return Err(EvalError::simple("incomplete", "npr expects 2 arguments."));
                }
                permutations(args[0], args[1])
            }
            _ => Err(EvalError::simple("incomplete", "Incomplete expression.")),
        }
    }

    fn primary(&mut self) -> Result<f64, EvalError> {
        let Some(token) = self.next() else {
            return Err(EvalError::simple("incomplete", "Incomplete expression."));
        };
        match token {
            Token::Num(v) => Ok(v),
            Token::LParen => {
                let v = self.expression()?;
                // 允许省略末尾右括号，方便渐进输入时实时预览
                if matches!(self.peek(), Some(Token::RParen)) {
                    self.next();
                }
                Ok(v)
            }
            Token::Name(name) => {
                if let Some(c) = lookup_constant(&name) {
                    return Ok(c);
                }
                if matches!(self.peek(), Some(Token::LParen)) {
                    let args = self.parse_call_args()?;
                    if UNARY_FUNCTIONS.contains(&name.as_str()) {
                        if args.len() != 1 {
                            return Err(EvalError::simple(
                                "extraContent",
                                "Unexpected extra arguments for unary function.",
                            ));
                        }
                        return self.eval_unary(&name, args[0]);
                    }
                    if MULTI_FUNCTIONS.contains(&name.as_str()) {
                        return self.eval_multi(&name, &args);
                    }
                    return Err(EvalError::simple("incomplete", "Incomplete expression."));
                }
                if !UNARY_FUNCTIONS.contains(&name.as_str()) {
                    return Err(EvalError::simple("incomplete", "Incomplete expression."));
                }
                let negative = if matches!(self.peek(), Some(Token::Op(op)) if op == "-") {
                    self.next();
                    true
                } else {
                    false
                };
                let arg = self.postfix()?;
                let x = if negative { -arg } else { arg };
                self.eval_unary(&name, x)
            }
            Token::Op(_) | Token::RParen | Token::Comma => {
                Err(EvalError::simple("incomplete", "Incomplete expression."))
            }
        }
    }
}

/// 12 位有效数字格式化，消除 `0.1 + 0.2` 和三角函数 `1e-17` 等浮点噪声。
pub(crate) fn format_result(n: f64) -> Result<String, EvalError> {
    if n.is_nan() {
        return Err(EvalError::simple(
            "invalidResult",
            "Result is undefined (NaN).",
        ));
    }
    if !n.is_finite() {
        return Ok(if n.is_sign_positive() {
            "∞".to_string()
        } else {
            "-∞".to_string()
        });
    }
    let abs = n.abs();
    if abs < 1e-12 {
        return Ok("0".to_string());
    }
    if abs >= 1e15 || abs < 1e-9 {
        let raw = format!("{n:.10e}");
        if let Some((mantissa, exp)) = raw.split_once('e') {
            let trimmed = mantissa.trim_end_matches('0').trim_end_matches('.');
            let exp_sign = if exp.starts_with('-') { "" } else { "+" };
            return Ok(format!("{trimmed}e{exp_sign}{exp}"));
        }
        return Ok(raw);
    }
    let rounded = format!("{n:.11e}").parse::<f64>().unwrap_or(n);
    let cleaned = if rounded == 0.0 { 0.0 } else { rounded };
    Ok(format!("{cleaned}"))
}

pub(crate) fn evaluate(input: &str, angle: AngleUnit) -> EvalResult {
    let tokens = match tokenize(input) {
        Ok(t) => t,
        Err(err) => return EvalResult::err(err),
    };
    if tokens.is_empty() {
        return EvalResult::err(EvalError::simple("needExpr", "Expression is empty."));
    }
    let mut parser = Parser {
        tokens,
        pos: 0,
        angle,
    };
    let value = match parser.expression() {
        Ok(v) => v,
        Err(err) => return EvalResult::err(err),
    };
    if parser.pos < parser.tokens.len() {
        return EvalResult::err(match parser.peek() {
            Some(Token::RParen | Token::LParen) => {
                EvalError::simple("parenMismatch", "Mismatched parentheses.")
            }
            _ => EvalError::simple("extraContent", "Unexpected extra tokens in expression."),
        });
    }
    match format_result(value) {
        Ok(formatted) => EvalResult::ok(value, formatted),
        Err(err) => EvalResult::err(err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evaluates_new_unary_functions_and_constants() {
        assert_eq!(evaluate("cbrt(27)", AngleUnit::Deg).formatted.as_deref(), Some("3"));
        assert_eq!(evaluate("∛-8", AngleUnit::Deg).formatted.as_deref(), Some("-2"));
        assert_eq!(evaluate("log2(1024)", AngleUnit::Deg).formatted.as_deref(), Some("10"));
        assert_eq!(evaluate("log10(1000)", AngleUnit::Deg).formatted.as_deref(), Some("3"));
        assert_eq!(evaluate("floor(3.9) + ceil(1.1)", AngleUnit::Deg).formatted.as_deref(), Some("5"));
        assert_eq!(evaluate("round(2.6) + trunc(-2.9)", AngleUnit::Deg).formatted.as_deref(), Some("1"));
        assert_eq!(evaluate("sign(-42)", AngleUnit::Deg).formatted.as_deref(), Some("-1"));
        assert_eq!(evaluate("deg(π)", AngleUnit::Deg).formatted.as_deref(), Some("180"));
        assert_eq!(evaluate("sin(rad(90))", AngleUnit::Rad).formatted.as_deref(), Some("1"));
        assert_eq!(evaluate("cosh(0)", AngleUnit::Rad).formatted.as_deref(), Some("1"));
        assert!((evaluate("τ / π", AngleUnit::Rad).value.unwrap() - 2.0).abs() < 1e-12);
        assert!((evaluate("φ^2 - φ", AngleUnit::Rad).value.unwrap() - 1.0).abs() < 1e-12);
    }

    #[test]
    fn evaluates_multi_arg_functions_and_floor_division() {
        assert_eq!(evaluate("7 // 2", AngleUnit::Deg).formatted.as_deref(), Some("3"));
        assert_eq!(evaluate("-7 // 2", AngleUnit::Deg).formatted.as_deref(), Some("-4"));
        assert_eq!(evaluate("pow(2, 10)", AngleUnit::Deg).formatted.as_deref(), Some("1024"));
        assert_eq!(evaluate("logn(2, 64)", AngleUnit::Deg).formatted.as_deref(), Some("6"));
        assert_eq!(evaluate("root(4, 16)", AngleUnit::Deg).formatted.as_deref(), Some("2"));
        assert_eq!(evaluate("root(3, -27)", AngleUnit::Deg).formatted.as_deref(), Some("-3"));
        assert_eq!(evaluate("hypot(3, 4)", AngleUnit::Deg).formatted.as_deref(), Some("5"));
        assert_eq!(evaluate("min(8, 3, 12)", AngleUnit::Deg).formatted.as_deref(), Some("3"));
        assert_eq!(evaluate("max(8, 3, 12)", AngleUnit::Deg).formatted.as_deref(), Some("12"));
        assert_eq!(evaluate("sum(1, 2, 3, 4)", AngleUnit::Deg).formatted.as_deref(), Some("10"));
        assert_eq!(evaluate("avg(2, 4, 6, 8)", AngleUnit::Deg).formatted.as_deref(), Some("5"));
        assert_eq!(evaluate("gcd(24, 36, 60)", AngleUnit::Deg).formatted.as_deref(), Some("12"));
        assert_eq!(evaluate("lcm(4, 6, 8)", AngleUnit::Deg).formatted.as_deref(), Some("24"));
        assert_eq!(evaluate("ncr(10, 3)", AngleUnit::Deg).formatted.as_deref(), Some("120"));
        assert_eq!(evaluate("npr(5, 3)", AngleUnit::Deg).formatted.as_deref(), Some("60"));
    }

    #[test]
    fn handles_errors_and_partial_calls() {
        let div_zero = evaluate("5 // 0", AngleUnit::Deg);
        assert!(!div_zero.ok);
        assert_eq!(div_zero.error.unwrap().code, "divZero");

        let incomplete = evaluate("gcd(12, ", AngleUnit::Deg);
        assert!(!incomplete.ok);
        assert_eq!(incomplete.error.unwrap().code, "incomplete");
    }
}
