//! 表格输出与合并单元格的行列跨度计算。
use super::super::xml::{attr, child, is, val};
use super::{table_pipes, Converter, Mode};
use roxmltree::Node;
use std::collections::HashMap;

impl Converter {
    pub(super) fn table(&mut self, table: Node<'_, '_>, mode: Mode) -> Result<String, String> {
        let rows: Vec<_> = table.children().filter(|n| is(*n, "tr")).collect();
        if rows.is_empty() {
            return Ok(String::new());
        }
        let width = rows[0].children().filter(|n| is(*n, "tc")).count();
        let complex = matches!(mode, Mode::Html)
            || width == 0
            || rows
                .iter()
                .any(|r| r.children().filter(|n| is(*n, "tc")).count() != width)
            || table.descendants().any(|n| {
                ["gridSpan", "vMerge", "hMerge", "gridBefore", "gridAfter"]
                    .iter()
                    .any(|name| is(n, name))
                    || (is(n, "tbl") && n != table)
            })
            || rows
                .iter()
                .flat_map(|r| r.children().filter(|n| is(*n, "tc")))
                .any(|cell| cell.children().filter(|n| is(*n, "p")).count() > 1);
        if !complex {
            let mut lines = vec![];
            for (i, row) in rows.iter().enumerate() {
                let mut cells = vec![];
                for cell in row.children().filter(|n| is(*n, "tc")) {
                    let content = self.blocks(cell, Mode::Markdown)?;
                    cells.push(
                        table_pipes(content.trim())
                            .replace("  \n", "<br>")
                            .replace('\n', "<br>"),
                    );
                }
                lines.push(format!("| {} |", cells.join(" | ")));
                if i == 0 {
                    lines.push(format!("| {} |", vec!["---"; width].join(" | ")));
                }
            }
            return Ok(format!("{}\n\n", lines.join("\n")));
        }
        struct Cell<'a, 'i> {
            node: Node<'a, 'i>,
            span: usize,
            rows: usize,
            skip: bool,
        }
        let mut grid: Vec<Vec<Cell<'_, '_>>> = vec![];
        let mut active: HashMap<usize, (usize, usize, usize)> = HashMap::new();
        for (ri, row) in rows.iter().enumerate() {
            let mut cells = vec![];
            let mut col = child(*row, "trPr")
                .and_then(|p| val(p, "gridBefore"))
                .and_then(|v| v.parse().ok())
                .unwrap_or(0usize)
                .min(1024);
            if col > 0 {
                cells.push(Cell {
                    node: *row,
                    span: col,
                    rows: 1,
                    skip: false,
                });
            }
            let mut next_active = HashMap::new();
            for cell in row.children().filter(|n| is(*n, "tc")) {
                let props = child(cell, "tcPr");
                let span = props
                    .and_then(|p| val(p, "gridSpan"))
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(1usize)
                    .clamp(1, 1024);
                let merge = props.and_then(|p| child(p, "vMerge"));
                let continuation = merge.is_some_and(|m| attr(m, "val") != Some("restart"));
                let mut skip = false;
                if continuation {
                    if let Some(&(prev_row, prev_cell, prev_span)) = active.get(&col) {
                        if prev_span == span {
                            grid[prev_row][prev_cell].rows += 1;
                            next_active.insert(col, (prev_row, prev_cell, span));
                            skip = true;
                        }
                    }
                } else if merge.is_some() {
                    next_active.insert(col, (ri, cells.len(), span));
                }
                cells.push(Cell {
                    node: cell,
                    span,
                    rows: 1,
                    skip,
                });
                col += span;
            }
            grid.push(cells);
            active = next_active;
        }
        let mut out = String::from("<table>\n");
        for row in grid {
            out += "<tr>";
            for cell in row.into_iter().filter(|c| !c.skip) {
                let mut attributes = String::new();
                if cell.span > 1 {
                    attributes += &format!(" colspan=\"{}\"", cell.span);
                }
                if cell.rows > 1 {
                    attributes += &format!(" rowspan=\"{}\"", cell.rows);
                }
                let content = if is(cell.node, "tc") {
                    self.blocks(cell.node, Mode::Html)?
                } else {
                    String::new()
                };
                out += &format!("<td{attributes}>{}</td>", content.trim());
            }
            out += "</tr>\n";
        }
        out += "</table>\n\n";
        Ok(out)
    }
}
