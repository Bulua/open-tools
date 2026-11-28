//! 中国大陆居民身份证号解析（GB 11643），支持 18 位与 15 位老号码渐进解析。

use serde::Serialize;

use super::regions::{has_province, lookup_region, Region};

const WEIGHTS: [u32; 17] = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CHARS: &[u8; 11] = b"10X98765432";

const ZODIACS: [&str; 12] = [
    "rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster",
    "dog", "pig",
];

const STARS: [(&str, u8, u8); 13] = [
    ("capricorn", 1, 1),
    ("aquarius", 1, 20),
    ("pisces", 2, 19),
    ("aries", 3, 21),
    ("taurus", 4, 20),
    ("gemini", 5, 21),
    ("cancer", 6, 22),
    ("leo", 7, 23),
    ("virgo", 8, 23),
    ("libra", 9, 23),
    ("scorpio", 10, 24),
    ("sagittarius", 11, 23),
    ("capricorn", 12, 22),
];

/// 1900–2100 年每年春节（农历正月初一）对应的公历 `(月, 日)`，用于按农历年精确划分生肖。
const SPRING_FESTIVAL_START_YEAR: i32 = 1900;
const SPRING_FESTIVAL: [(u8, u8); 201] = [
    (1, 31), (2, 19), (2, 8), (1, 29), (2, 16), (2, 4), (1, 25), (2, 13), (2, 2), (1, 22),
    (2, 10), (1, 30), (2, 18), (2, 6), (1, 26), (2, 14), (2, 3), (1, 23), (2, 11), (2, 1),
    (2, 20), (2, 8), (1, 28), (2, 16), (2, 5), (1, 24), (2, 13), (2, 2), (1, 23), (2, 10),
    (1, 30), (2, 17), (2, 6), (1, 26), (2, 14), (2, 4), (1, 24), (2, 11), (1, 31), (2, 19),
    (2, 8), (1, 27), (2, 15), (2, 5), (1, 25), (2, 13), (2, 2), (1, 22), (2, 10), (1, 29),
    (2, 17), (2, 6), (1, 27), (2, 14), (2, 4), (1, 24), (2, 12), (1, 31), (2, 18), (2, 8),
    (1, 28), (2, 15), (2, 5), (1, 25), (2, 13), (2, 2), (1, 21), (2, 9), (1, 30), (2, 17),
    (2, 6), (1, 27), (2, 15), (2, 3), (1, 23), (2, 11), (1, 31), (2, 18), (2, 7), (1, 28),
    (2, 16), (2, 5), (1, 25), (2, 13), (2, 2), (2, 20), (2, 9), (1, 29), (2, 17), (2, 6),
    (1, 27), (2, 15), (2, 4), (1, 23), (2, 10), (1, 31), (2, 19), (2, 7), (1, 28), (2, 16),
    (2, 5), (1, 24), (2, 12), (2, 1), (1, 22), (2, 9), (1, 29), (2, 18), (2, 7), (1, 26),
    (2, 14), (2, 3), (1, 23), (2, 10), (1, 31), (2, 19), (2, 8), (1, 28), (2, 16), (2, 5),
    (1, 25), (2, 12), (2, 1), (1, 22), (2, 10), (1, 29), (2, 17), (2, 7), (1, 26), (2, 13),
    (2, 2), (1, 23), (2, 11), (1, 31), (2, 19), (2, 8), (1, 28), (2, 15), (2, 4), (1, 24),
    (2, 12), (2, 1), (1, 22), (2, 10), (1, 30), (2, 17), (2, 6), (1, 26), (2, 14), (2, 2),
    (1, 23), (2, 11), (2, 1), (2, 19), (2, 8), (1, 28), (2, 15), (2, 4), (1, 24), (2, 12),
    (2, 2), (1, 21), (2, 9), (1, 29), (2, 17), (2, 5), (1, 26), (2, 14), (2, 3), (1, 23),
    (2, 11), (1, 31), (2, 19), (2, 7), (1, 27), (2, 15), (2, 5), (1, 24), (2, 12), (2, 2),
    (1, 22), (2, 9), (1, 29), (2, 17), (2, 6), (1, 26), (2, 14), (2, 3), (1, 24), (2, 10),
    (1, 30), (2, 18), (2, 7), (1, 27), (2, 15), (2, 5), (1, 25), (2, 12), (2, 1), (1, 21),
    (2, 9),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Birth {
    pub(crate) year: i32,
    pub(crate) month: u8,
    pub(crate) day: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IdChecks {
    pub(crate) region: Option<bool>,
    pub(crate) birth: Option<bool>,
    pub(crate) checksum: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IdInfo {
    pub(crate) digits: String,
    pub(crate) id18: Option<String>,
    pub(crate) from15: bool,
    pub(crate) region_code: String,
    pub(crate) region: Region,
    pub(crate) birth: Option<Birth>,
    pub(crate) age: Option<i32>,
    pub(crate) days_since: Option<i64>,
    pub(crate) days_to_birthday: Option<i64>,
    pub(crate) zodiac: Option<&'static str>,
    pub(crate) star: Option<&'static str>,
    pub(crate) sequence: String,
    pub(crate) male: Option<bool>,
    pub(crate) check_digit: Option<String>,
    pub(crate) expected_check_digit: Option<String>,
    pub(crate) checks: IdChecks,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IdParseResult {
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) info: Option<IdInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<&'static str>,
}

fn is_leap(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

fn is_real_date(b: Birth) -> bool {
    b.year >= 1 && (1..=12).contains(&b.month) && b.day >= 1 && b.day <= days_in_month(b.year, b.month)
}

/// Howard Hinnant 公历转儒略日偏移量（以 1970-01-01 为 0）。
fn days_from_civil(b: Birth) -> i64 {
    let y = i64::from(b.year) - i64::from(b.month <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let m = i64::from(b.month);
    let d = i64::from(b.day);
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

#[cfg(not(windows))]
fn civil_from_days(z: i64) -> Birth {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = (y + i64::from(m <= 2)) as i32;
    Birth {
        year,
        month: m as u8,
        day: d as u8,
    }
}

#[cfg(windows)]
pub(crate) fn today_local() -> Birth {
    use windows_sys::Win32::Foundation::SYSTEMTIME;
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;

    let mut st = SYSTEMTIME {
        wYear: 0,
        wMonth: 0,
        wDayOfWeek: 0,
        wDay: 0,
        wHour: 0,
        wMinute: 0,
        wSecond: 0,
        wMilliseconds: 0,
    };
    // SAFETY: `GetLocalTime` writes the current local system time into the provided out-pointer.
    unsafe {
        GetLocalTime(&mut st);
    }
    Birth {
        year: i32::from(st.wYear),
        month: st.wMonth as u8,
        day: st.wDay as u8,
    }
}

#[cfg(not(windows))]
pub(crate) fn today_local() -> Birth {
    use std::time::{SystemTime, UNIX_EPOCH};

    // 非 Windows 环境下按中国标准时间（UTC+8）计算当日日期。
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
        + 8 * 3600;
    civil_from_days(secs.div_euclid(86_400))
}

fn normalize_id(input: &str) -> String {
    input
        .chars()
        .filter(|ch| !ch.is_whitespace() && *ch != '-' && *ch != '_')
        .map(|ch| ch.to_ascii_uppercase())
        .collect()
}

fn check_digit_of(first17: &str) -> char {
    let sum: u32 = first17
        .bytes()
        .zip(WEIGHTS)
        .map(|(b, w)| u32::from(b - b'0') * w)
        .sum();
    CHECK_CHARS[(sum % 11) as usize] as char
}

fn birth_of(yyyymmdd: &str) -> Birth {
    let year = yyyymmdd[0..4].parse::<i32>().unwrap_or(0);
    let month = yyyymmdd[4..6].parse::<u8>().unwrap_or(0);
    let day = yyyymmdd[6..8].parse::<u8>().unwrap_or(0);
    Birth { year, month, day }
}

fn valid_birth(b: Birth, today: Birth) -> bool {
    is_real_date(b) && b <= today
}

fn age_on(birth: Birth, today: Birth) -> i32 {
    let age = today.year - birth.year;
    if today.month < birth.month || (today.month == birth.month && today.day < birth.day) {
        age - 1
    } else {
        age
    }
}

fn birthday_in(birth: Birth, year: i32) -> Birth {
    if birth.month == 2 && birth.day == 29 && !is_leap(year) {
        Birth {
            year,
            month: 2,
            day: 28,
        }
    } else {
        Birth {
            year,
            month: birth.month,
            day: birth.day,
        }
    }
}

fn days_to_birthday(birth: Birth, today: Birth) -> i64 {
    let mut next = birthday_in(birth, today.year);
    if next < today {
        next = birthday_in(birth, today.year + 1);
    }
    days_from_civil(next) - days_from_civil(today)
}

fn days_since(birth: Birth, today: Birth) -> i64 {
    days_from_civil(today) - days_from_civil(birth)
}

fn star_of(b: Birth) -> &'static str {
    let mut id = "capricorn";
    for &(star, from_m, from_d) in &STARS {
        if b.month > from_m || (b.month == from_m && b.day >= from_d) {
            id = star;
        }
    }
    id
}

fn lunar_year_of(b: Birth) -> i32 {
    let idx = b.year - SPRING_FESTIVAL_START_YEAR;
    if idx >= 0 && (idx as usize) < SPRING_FESTIVAL.len() {
        let (sf_m, sf_d) = SPRING_FESTIVAL[idx as usize];
        if b.month < sf_m || (b.month == sf_m && b.day < sf_d) {
            return b.year - 1;
        }
    }
    b.year
}

fn zodiac_of(b: Birth) -> &'static str {
    let idx = (lunar_year_of(b) - 4).rem_euclid(12) as usize;
    ZODIACS[idx]
}

fn valid_chars(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.is_empty() {
        return true;
    }
    let last = bytes.len() - 1;
    for (i, &b) in bytes.iter().enumerate() {
        if b.is_ascii_digit() {
            continue;
        }
        if b == b'X' && i == last && bytes.len() == 18 {
            continue;
        }
        return false;
    }
    true
}

/// 解析身份证号，支持 1~18 位渐进解析及 15 位老号码升级 18 位。
pub(crate) fn parse_id_card(input: &str) -> IdParseResult {
    let today = today_local();
    let s = normalize_id(input);
    if s.len() > 18 {
        return IdParseResult {
            ok: false,
            info: None,
            error: Some("length"),
        };
    }
    if !valid_chars(&s) {
        return IdParseResult {
            ok: false,
            info: None,
            error: Some("chars"),
        };
    }

    let from15 = s.len() == 15
        && !valid_birth(birth_of(&s[6..14]), today)
        && valid_birth(birth_of(&format!("19{}", &s[6..12])), today);

    let first17 = if from15 {
        format!("{}19{}", &s[0..6], &s[6..])
    } else {
        s[..s.len().min(17)].to_string()
    };

    let expected_check_digit = if first17.len() == 17 {
        Some(check_digit_of(&first17).to_string())
    } else {
        None
    };
    let check_digit = if s.len() == 18 {
        Some(s[17..18].to_string())
    } else {
        None
    };

    let raw_date = if first17.len() >= 14 {
        Some(birth_of(&first17[6..14]))
    } else {
        None
    };
    let birth = raw_date.filter(|&d| is_real_date(d));
    let birth_ok = raw_date.map(|d| valid_birth(d, today));
    let lived = birth.filter(|_| birth_ok == Some(true));

    let region_code = s[..s.len().min(6)].to_string();
    let region = lookup_region(&region_code);
    let sequence = if first17.len() > 14 {
        first17[14..first17.len().min(17)].to_string()
    } else {
        String::new()
    };
    let male = if first17.len() == 17 {
        Some((first17.as_bytes()[16] - b'0') % 2 == 1)
    } else {
        None
    };

    let id18 = if from15 || s.len() == 18 {
        expected_check_digit
            .as_deref()
            .map(|digit| format!("{first17}{digit}"))
    } else {
        None
    };

    let checks = IdChecks {
        region: if s.len() >= 2 {
            Some(has_province(&s[..2]))
        } else {
            None
        },
        birth: birth_ok,
        checksum: if from15 {
            Some(true)
        } else {
            check_digit
                .as_deref()
                .map(|actual| Some(actual) == expected_check_digit.as_deref())
        },
    };

    IdParseResult {
        ok: true,
        info: Some(IdInfo {
            digits: s,
            id18,
            from15,
            region_code,
            region,
            birth,
            age: lived.map(|b| age_on(b, today)),
            days_since: lived.map(|b| days_since(b, today)),
            days_to_birthday: lived.map(|b| days_to_birthday(b, today)),
            zodiac: birth.map(zodiac_of),
            star: birth.map(star_of),
            sequence,
            male,
            check_digit,
            expected_check_digit,
            checks,
        }),
        error: None,
    }
}
