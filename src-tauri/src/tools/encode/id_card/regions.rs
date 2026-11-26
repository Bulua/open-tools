//! GB/T 2260（2023）行政区划代码表，后端单一数据源，供界面与 AI 工具共享。

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use serde::Serialize;

const RAW_REGIONS: &str = include_str!("regions.txt");

struct RegionTable {
    entries: HashMap<&'static str, &'static str>,
    provinces: HashSet<&'static str>,
}

static REGION_TABLE: OnceLock<RegionTable> = OnceLock::new();

fn table() -> &'static RegionTable {
    REGION_TABLE.get_or_init(|| {
        let mut entries = HashMap::with_capacity(3300);
        let mut provinces = HashSet::with_capacity(40);
        for item in RAW_REGIONS.trim().split('|') {
            if item.len() > 6 && item.is_char_boundary(6) {
                let code = &item[..6];
                let name = &item[6..];
                entries.insert(code, name);
                if code.ends_with("0000") {
                    provinces.insert(&code[..2]);
                }
            }
        }
        RegionTable { entries, provinces }
    })
}

/// 行政区划解析结果；直辖市与省直辖县级行政区没有市一级。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Region {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) province: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) city: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) county: Option<String>,
    /// 6 位区县代码在码表中是否存在；未输入满 6 位时为 `None`。
    pub(crate) found: Option<bool>,
}

pub(crate) fn has_province(code2: &str) -> bool {
    table().provinces.contains(code2)
}

/// 按最多 6 位地区码查询省、市、区县名称（支持 2 位、4 位或 6 位渐进查询）。
pub(crate) fn lookup_region(code: &str) -> Region {
    let entries = &table().entries;
    let province = if code.len() >= 2 {
        let key = format!("{}0000", &code[..2]);
        entries.get(key.as_str()).map(|s| (*s).to_string())
    } else {
        None
    };
    let city = if code.len() >= 4 && &code[2..4] != "00" {
        let key = format!("{}00", &code[..4]);
        entries.get(key.as_str()).map(|s| (*s).to_string())
    } else {
        None
    };
    let county = if code.len() == 6 && &code[4..6] != "00" {
        entries.get(code).map(|s| (*s).to_string())
    } else {
        None
    };
    let found = if code.len() == 6 {
        Some(entries.contains_key(code))
    } else {
        None
    };
    Region {
        province,
        city,
        county,
        found,
    }
}
