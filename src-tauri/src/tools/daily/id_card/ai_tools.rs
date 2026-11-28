//! 将「身份证号解析」封装为统一 `AiTool`，复用后端 GB 11643 解析器与行政区划码表。

use serde_json::{json, Value};

use crate::tools::ai::args;
use crate::tools::ai::registry::{AiTool, AiToolContext, AiToolFuture, AiToolResult};

use super::parser::{parse_id_card, IdParseResult};

const MAX_BATCH_IDS: usize = 50;

fn zodiac_zh(id: &str) -> &'static str {
    match id {
        "rat" => "鼠",
        "ox" => "牛",
        "tiger" => "虎",
        "rabbit" => "兔",
        "dragon" => "龙",
        "snake" => "蛇",
        "horse" => "马",
        "goat" => "羊",
        "monkey" => "猴",
        "rooster" => "鸡",
        "dog" => "狗",
        "pig" => "猪",
        _ => "",
    }
}

fn star_zh(id: &str) -> &'static str {
    match id {
        "capricorn" => "摩羯座",
        "aquarius" => "水瓶座",
        "pisces" => "双鱼座",
        "aries" => "白羊座",
        "taurus" => "金牛座",
        "gemini" => "双子座",
        "cancer" => "巨蟹座",
        "leo" => "狮子座",
        "virgo" => "处女座",
        "libra" => "天秤座",
        "scorpio" => "天蝎座",
        "sagittarius" => "射手座",
        _ => "",
    }
}

fn summarize_result(input: &str, result: &IdParseResult) -> Value {
    let Some(ref info) = result.info else {
        let reason = match result.error {
            Some("length") => "身份证号超过 18 位",
            Some("chars") => "包含非法字符（仅允许数字，18 位末位可为 X）",
            _ => "格式无效",
        };
        return json!({
            "input": input,
            "valid": false,
            "error": result.error,
            "reason": reason
        });
    };

    let mut issues: Vec<String> = Vec::new();
    if info.id18.is_none() {
        issues.push(format!("号码长度不完整（当前 {} 位，应为 18 位或 15 位）", info.digits.len()));
    }
    if info.checks.region == Some(false) {
        issues.push("省级行政区划代码无效".to_string());
    }
    if info.checks.birth == Some(false) {
        issues.push("出生日期不合法或晚于今天".to_string());
    }
    if info.checks.checksum == Some(false) {
        if let Some(ref expected) = info.expected_check_digit {
            issues.push(format!("校验码错误（正确校验码应为 {expected}）"));
        } else {
            issues.push("校验码错误".to_string());
        }
    }

    let valid = info.id18.is_some() && issues.is_empty();
    let region_parts: Vec<&str> = [
        info.region.province.as_deref(),
        info.region.city.as_deref(),
        info.region.county.as_deref(),
    ]
    .into_iter()
    .flatten()
    .collect();
    let region_full = if region_parts.is_empty() {
        Value::Null
    } else {
        Value::String(region_parts.join(" "))
    };
    let birth_date = info
        .birth
        .map(|b| format!("{:04}-{:02}-{:02}", b.year, b.month, b.day));
    let gender = info.male.map(|m| if m { "男" } else { "女" });

    json!({
        "input": input,
        "valid": valid,
        "issues": issues,
        "id18": info.id18,
        "from15": info.from15,
        "regionCode": info.region_code,
        "regionFull": region_full,
        "province": info.region.province,
        "city": info.region.city,
        "county": info.region.county,
        "regionInCurrentTable": info.region.found,
        "birthDate": birth_date,
        "age": info.age,
        "daysLived": info.days_since,
        "daysToNextBirthday": info.days_to_birthday,
        "gender": gender,
        "zodiac": info.zodiac.map(zodiac_zh),
        "constellation": info.star.map(star_zh),
        "sequenceCode": info.sequence,
        "checkDigit": info.check_digit,
        "expectedCheckDigit": info.expected_check_digit,
        "checks": info.checks
    })
}

pub(crate) struct ParseIdCardTool;

impl AiTool for ParseIdCardTool {
    fn name(&self) -> &'static str {
        "parse_id_card"
    }

    fn description(&self) -> &'static str {
        "Validate and parse Chinese Mainland Resident Identity Card numbers (GB 11643, 18-digit or 15-digit auto-upgraded to 18-digit): checks MOD 11-2 checksum, looks up GB/T 2260 province/city/county, birth date, age, days to next birthday, gender, lunar zodiac, and constellation."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "A single 18-digit or 15-digit Chinese Mainland ID card number (spaces or hyphens allowed)."
                },
                "ids": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional list of ID card numbers for batch validation and parsing (up to 50)."
                }
            }
        })
    }

    fn execute<'a>(&'a self, args: Value, _ctx: &'a AiToolContext<'a>) -> AiToolFuture<'a> {
        Box::pin(async move {
            let mut inputs: Vec<String> = Vec::new();
            if let Some(single) = args::trimmed(&args, "id") {
                inputs.push(single);
            }
            match args::string_vec(&args, "ids") {
                Ok(batch) => {
                    for item in batch {
                        let trimmed = item.trim();
                        if !trimmed.is_empty() {
                            inputs.push(trimmed.to_string());
                        }
                    }
                }
                Err(err) => return AiToolResult::err(err),
            }

            if inputs.is_empty() {
                return AiToolResult::err("Please provide 'id' or a non-empty 'ids' array.");
            }
            if inputs.len() > MAX_BATCH_IDS {
                return AiToolResult::err(format!(
                    "Too many ID numbers in one request ({}, max {MAX_BATCH_IDS}).",
                    inputs.len()
                ));
            }

            let items: Vec<Value> = inputs
                .iter()
                .map(|raw| {
                    let parsed = parse_id_card(raw);
                    summarize_result(raw, &parsed)
                })
                .collect();

            let payload = if items.len() == 1 {
                items.into_iter().next().unwrap()
            } else {
                json!({
                    "count": items.len(),
                    "results": items
                })
            };

            match serde_json::to_string_pretty(&payload) {
                Ok(text) => AiToolResult::ok(text),
                Err(err) => AiToolResult::err(format!("Failed to format ID card result: {err}")),
            }
        })
    }
}
