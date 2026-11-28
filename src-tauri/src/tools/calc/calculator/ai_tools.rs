//! 将「科学计算器」封装为统一 `AiTool`，供 AI 精确计算数学表达式。

use serde_json::{json, Value};

use crate::tools::ai::args;
use crate::tools::ai::registry::{AiTool, AiToolContext, AiToolFuture, AiToolResult};

use super::eval::{evaluate, AngleUnit};

const MAX_BATCH_EXPRESSIONS: usize = 50;

pub(crate) struct CalculateTool;

impl AiTool for CalculateTool {
    fn name(&self) -> &'static str {
        "calculate"
    }

    fn description(&self) -> &'static str {
        "Evaluate mathematical expressions accurately with the built-in scientific calculator. Supports + - * / ^ mod % ! parentheses, implicit multiplication (2pi, 2(3+4)), constants (pi, π, e), functions (sqrt, sin, cos, tan, asin, acos, atan, log, ln, abs, exp), and deg/rad angle units."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "A single mathematical expression to evaluate (e.g. '2^10 + sqrt(144)', 'sin(30) * 100', '10000 * (1 + 0.045)^10')."
                },
                "expressions": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional batch list of mathematical expressions to evaluate (up to 50)."
                },
                "angle": {
                    "type": "string",
                    "enum": ["deg", "rad"],
                    "description": "Angle unit for trigonometric functions: 'deg' (degrees, default) or 'rad' (radians)."
                }
            }
        })
    }

    fn execute<'a>(&'a self, args: Value, _ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let angle = match AngleUnit::parse(args::trimmed(&args, "angle").as_deref()) {
                Ok(u) => u,
                Err(err) => return AiToolResult::err(err),
            };

            let mut exprs: Vec<String> = Vec::new();
            if let Some(single) = args::trimmed(&args, "expression") {
                exprs.push(single);
            }
            match args::string_vec(&args, "expressions") {
                Ok(batch) => {
                    for item in batch {
                        let trimmed = item.trim();
                        if !trimmed.is_empty() {
                            exprs.push(trimmed.to_string());
                        }
                    }
                }
                Err(err) => return AiToolResult::err(err),
            }

            if exprs.is_empty() {
                return AiToolResult::err(
                    "Please provide 'expression' or a non-empty 'expressions' array.",
                );
            }
            if exprs.len() > MAX_BATCH_EXPRESSIONS {
                return AiToolResult::err(format!(
                    "Too many expressions in one request ({}, max {MAX_BATCH_EXPRESSIONS}).",
                    exprs.len()
                ));
            }

            if exprs.len() == 1 {
                let expr = &exprs[0];
                let res = evaluate(expr, angle);
                if res.ok {
                    return AiToolResult::ok(format!(
                        "{expr} = {} (angle: {})",
                        res.formatted.unwrap_or_default(),
                        angle.as_str()
                    ));
                }
                let msg = res
                    .error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "Failed to evaluate expression.".to_string());
                return AiToolResult::err(format!("Failed to evaluate '{expr}': {msg}"));
            }

            let items: Vec<Value> = exprs
                .iter()
                .map(|expr| {
                    let res = evaluate(expr, angle);
                    json!({
                        "expression": expr,
                        "ok": res.ok,
                        "result": res.formatted,
                        "value": res.value,
                        "error": res.error.map(|e| e.message)
                    })
                })
                .collect();
            let payload = json!({
                "angle": angle.as_str(),
                "results": items
            });
            match serde_json::to_string_pretty(&payload) {
                Ok(text) => AiToolResult::ok(text),
                Err(err) => AiToolResult::err(format!("Failed to format calculation result: {err}")),
            }
        })
    }
}
