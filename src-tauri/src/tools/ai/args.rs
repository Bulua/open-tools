//! AI 工具 JSON 参数提取辅助函数，供各模块 `AiTool` 实现统一复用。

use std::collections::HashMap;

use serde_json::Value;

/// 读取字符串参数；不存在或非字符串时返回空串。
pub(crate) fn str_or_empty(args: &Value, key: &str) -> String {
    args.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// 读取去首尾空白后的非空字符串参数。
pub(crate) fn trimmed(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

/// 读取布尔参数，缺失或类型不符时返回默认值。
pub(crate) fn bool_or(args: &Value, key: &str, default: bool) -> bool {
    args.get(key).and_then(Value::as_bool).unwrap_or(default)
}

/// 读取可选非负整数参数。
pub(crate) fn opt_usize(args: &Value, key: &str) -> Option<usize> {
    args.get(key)
        .and_then(Value::as_u64)
        .and_then(|v| usize::try_from(v).ok())
}

/// 读取字符串数组参数；字段缺失或为 `null` 时返回空数组，类型错误时返回英文报错。
pub(crate) fn string_vec(args: &Value, key: &str) -> Result<Vec<String>, String> {
    let Some(val) = args.get(key) else {
        return Ok(Vec::new());
    };
    if val.is_null() {
        return Ok(Vec::new());
    }
    let arr = val
        .as_array()
        .ok_or_else(|| format!("Parameter '{key}' must be an array of strings."))?;
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        let text = item
            .as_str()
            .ok_or_else(|| format!("Every element in '{key}' must be a string."))?;
        out.push(text.to_string());
    }
    Ok(out)
}

/// 读取字符串键值表参数；字段缺失或为 `null` 时返回空表，类型错误时返回英文报错。
pub(crate) fn string_map(args: &Value, key: &str) -> Result<HashMap<String, String>, String> {
    let Some(val) = args.get(key) else {
        return Ok(HashMap::new());
    };
    if val.is_null() {
        return Ok(HashMap::new());
    }
    let obj = val.as_object().ok_or_else(|| {
        format!("Parameter '{key}' must be an object mapping strings to strings.")
    })?;
    let mut out = HashMap::with_capacity(obj.len());
    for (k, v) in obj {
        let text = v
            .as_str()
            .ok_or_else(|| format!("Value for '{key}.{k}' must be a string."))?;
        out.insert(k.clone(), text.to_string());
    }
    Ok(out)
}
