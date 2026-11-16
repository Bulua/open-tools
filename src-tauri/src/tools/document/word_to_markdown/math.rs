//! 将 Word 原生 OMML 公式转换为 Markdown 使用的 LaTeX。
use super::xml::{child, is, val};
use roxmltree::Node;

fn text(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            'α' => "\\alpha ".into(),
            'β' => "\\beta ".into(),
            'γ' => "\\gamma ".into(),
            'δ' => "\\delta ".into(),
            'ε' => "\\epsilon ".into(),
            'θ' => "\\theta ".into(),
            'λ' => "\\lambda ".into(),
            'μ' => "\\mu ".into(),
            'π' => "\\pi ".into(),
            'σ' => "\\sigma ".into(),
            'φ' => "\\phi ".into(),
            'ω' => "\\omega ".into(),
            'Δ' => "\\Delta ".into(),
            'Σ' => "\\Sigma ".into(),
            'Ω' => "\\Omega ".into(),
            '∞' => "\\infty ".into(),
            '∂' => "\\partial ".into(),
            '∇' => "\\nabla ".into(),
            '≤' => "\\le ".into(),
            '≥' => "\\ge ".into(),
            '≠' => "\\ne ".into(),
            '≈' => "\\approx ".into(),
            '±' => "\\pm ".into(),
            '×' => "\\times ".into(),
            '÷' => "\\div ".into(),
            '·' | '⋅' => "\\cdot ".into(),
            '−' => "-".into(),
            '∈' => "\\in ".into(),
            '∉' => "\\notin ".into(),
            '∪' => "\\cup ".into(),
            '∩' => "\\cap ".into(),
            '→' => "\\to ".into(),
            '∑' => "\\sum ".into(),
            '∏' => "\\prod ".into(),
            '∫' => "\\int ".into(),
            '∮' => "\\oint ".into(),
            '{' | '}' | '%' | '#' | '&' | '_' | '$' => format!("\\{c}"),
            '\\' => "\\backslash ".into(),
            '^' => "\\hat{}".into(),
            '~' => "\\sim ".into(),
            _ => c.to_string(),
        })
        .collect()
}

fn part(node: Node<'_, '_>, name: &str) -> Option<String> {
    child(node, name).and_then(latex)
}
fn property(node: Node<'_, '_>, group: &str, name: &str, fallback: &str) -> String {
    child(node, group)
        .and_then(|p| val(p, name))
        .unwrap_or(fallback)
        .into()
}
fn delimiter(value: &str) -> String {
    match value {
        "" => ".".into(),
        "{" => "\\{".into(),
        "}" => "\\}".into(),
        "‖" => "\\Vert".into(),
        _ => value.into(),
    }
}

/// 任意不支持的结构使整条公式跳过，避免生成缺少操作数的公式。
pub(super) fn latex(node: Node<'_, '_>) -> Option<String> {
    if !node.is_element() {
        return Some(String::new());
    }
    let name = node.tag_name().name();
    if name.ends_with("Pr") {
        return Some(String::new());
    }
    Some(match name {
        "t" => text(node.text().unwrap_or("")),
        "f" => format!("\\frac{{{}}}{{{}}}", part(node, "num")?, part(node, "den")?),
        "sSup" => format!("{{{}}}^{{{}}}", part(node, "e")?, part(node, "sup")?),
        "sSub" => format!("{{{}}}_{{{}}}", part(node, "e")?, part(node, "sub")?),
        "sSubSup" => format!(
            "{{{}}}_{{{}}}^{{{}}}",
            part(node, "e")?,
            part(node, "sub")?,
            part(node, "sup")?
        ),
        "sPre" => format!(
            "{{}}_{{{}}}^{{{}}}{{{}}}",
            part(node, "sub")?,
            part(node, "sup")?,
            part(node, "e")?
        ),
        "rad" => {
            let degree = part(node, "deg").unwrap_or_default();
            let hidden = child(node, "radPr").and_then(|n| val(n, "degHide")) == Some("1");
            if degree.is_empty() || hidden {
                format!("\\sqrt{{{}}}", part(node, "e")?)
            } else {
                format!("\\sqrt[{degree}]{{{}}}", part(node, "e")?)
            }
        }
        "nary" => {
            let op = text(&property(node, "naryPr", "chr", "∫"));
            let mut out = op;
            for (key, mark) in [("sub", "_"), ("sup", "^")] {
                let hidden =
                    child(node, "naryPr").and_then(|p| val(p, &format!("{key}Hide"))) == Some("1");
                if !hidden {
                    if let Some(s) = part(node, key).filter(|s| !s.is_empty()) {
                        out += &format!("{mark}{{{s}}}");
                    }
                }
            }
            format!("{out} {{{}}}", part(node, "e")?)
        }
        "d" => {
            let left = delimiter(&property(node, "dPr", "begChr", "("));
            let right = delimiter(&property(node, "dPr", "endChr", ")"));
            let sep = delimiter(&property(node, "dPr", "sepChr", "|"));
            let args: Option<Vec<_>> = node.children().filter(|n| is(*n, "e")).map(latex).collect();
            format!(
                "\\left{left} {} \\right{right}",
                args?.join(&format!(" \\middle{sep} "))
            )
        }
        "m" => {
            let rows: Option<Vec<_>> = node
                .children()
                .filter(|n| is(*n, "mr"))
                .map(|row| {
                    let cells: Option<Vec<_>> =
                        row.children().filter(|n| is(*n, "e")).map(latex).collect();
                    cells.map(|c| c.join(" & "))
                })
                .collect();
            format!("\\begin{{matrix}}{}\\end{{matrix}}", rows?.join(" \\\\ "))
        }
        "eqArr" => {
            let rows: Option<Vec<_>> = node.children().filter(|n| is(*n, "e")).map(latex).collect();
            format!("\\begin{{aligned}}{}\\end{{aligned}}", rows?.join(" \\\\ "))
        }
        "acc" => {
            let chr = property(node, "accPr", "chr", "̂");
            let command = match chr.as_str() {
                "̂" | "^" => "hat",
                "̄" | "¯" => "bar",
                "⃗" | "→" => "vec",
                "̇" => "dot",
                "̈" => "ddot",
                "̃" | "~" => "tilde",
                _ => return None,
            };
            format!("\\{command}{{{}}}", part(node, "e")?)
        }
        "bar" => format!(
            "\\{}{{{}}}",
            if property(node, "barPr", "pos", "top") == "bot" {
                "underline"
            } else {
                "overline"
            },
            part(node, "e")?
        ),
        "limLow" | "limUpp" => format!(
            "\\{}{{{}}}{{{}}}",
            if name == "limLow" {
                "underset"
            } else {
                "overset"
            },
            part(node, "lim")?,
            part(node, "e")?
        ),
        "func" => {
            let function = part(node, "fName")?;
            let function = match function.trim() {
                "sin" | "cos" | "tan" | "log" | "ln" | "lim" | "max" | "min" | "exp" | "det" => {
                    format!("\\{}", function.trim())
                }
                _ => function,
            };
            format!("{function} {{{}}}", part(node, "e")?)
        }
        "oMath" | "oMathPara" | "r" | "e" | "num" | "den" | "deg" | "sup" | "sub" | "lim"
        | "fName" | "box" => {
            let parts: Option<Vec<_>> = node
                .children()
                .filter(|n| n.is_element())
                .map(latex)
                .collect();
            parts?.concat()
        }
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::super::xml::parse;
    use super::*;
    fn formula(body: &str) -> Option<String> {
        let xml = format!(
            r#"<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">{body}</m:oMath>"#
        );
        let doc = parse(&xml).unwrap();
        latex(doc.root_element())
    }
    #[test]
    fn fractions_roots_scripts_and_symbols() {
        assert_eq!(formula("<m:f><m:num><m:r><m:t>α</m:t></m:r></m:num><m:den><m:rad><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad></m:den></m:f>").unwrap(), "\\frac{\\alpha }{\\sqrt{x}}");
        assert_eq!(formula("<m:sSubSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup>").unwrap(), "{x}_{i}^{2}");
    }
    #[test]
    fn unknown_formula_is_skipped_in_full() {
        assert_eq!(formula("<m:r><m:t>x</m:t></m:r><m:unknown/>"), None);
    }
}
