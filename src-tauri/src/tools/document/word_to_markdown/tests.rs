//! 使用真实 ZIP/XML 结构覆盖内容保留、资源引用和不可信文档边界。
use super::package::MAX_XML;
use super::*;
use std::io::Read;
const NS: &str = r#"xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart""#;
fn package(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut zip = ZipWriter::new(Cursor::new(vec![]));
    for (name, data) in entries {
        zip.start_file(
            *name,
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
        )
        .unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap().into_inner()
}
fn docx(body: &str, extras: &[(&str, &[u8])]) -> Vec<u8> {
    let xml = format!("<w:document {NS}><w:body>{body}</w:body></w:document>");
    let mut entries = vec![("word/document.xml", xml.as_bytes())];
    entries.extend_from_slice(extras);
    package(&entries)
}
fn unpack(data: Vec<u8>) -> HashMap<String, Vec<u8>> {
    let mut archive = ZipArchive::new(Cursor::new(data)).unwrap();
    let mut files = HashMap::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).unwrap();
        let mut data = vec![];
        entry.read_to_end(&mut data).unwrap();
        files.insert(entry.name().unwrap().into_owned(), data);
    }
    files
}
fn markdown(body: &str, extras: &[(&str, &[u8])]) -> String {
    let files = unpack(convert(docx(body, extras), "测试.docx").unwrap());
    String::from_utf8(files["测试.md"].clone()).unwrap()
}
fn p(text: &str) -> String {
    format!("<w:p><w:r><w:t>{text}</w:t></w:r></w:p>")
}
fn tc(text: &str) -> String {
    format!("<w:tc>{}</w:tc>", p(text))
}

#[test]
fn preserves_heading_styles_text_links_and_final_revisions() {
    let styles = format!(
        r#"<w:styles {NS}><w:style w:styleId="Base"><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style><w:style w:styleId="Derived"><w:basedOn w:val="Base"/></w:style></w:styles>"#
    );
    let rels = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/a b" TargetMode="External"/></Relationships>"#;
    let out = markdown(
        r#"<w:p><w:pPr><w:pStyle w:val="Derived"/></w:pPr><w:r><w:t>中文标题</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>粗斜体</w:t></w:r><w:hyperlink r:id="r1"><w:r><w:t>链接</w:t></w:r></w:hyperlink><w:del><w:r><w:delText>已删除</w:delText></w:r></w:del><w:ins><w:r><w:t>新增</w:t></w:r></w:ins></w:p>"#,
        &[
            ("word/styles.xml", styles.as_bytes()),
            ("word/_rels/document.xml.rels", rels.as_bytes()),
        ],
    );
    assert!(out.starts_with("## 中文标题\n\n"));
    assert!(out.contains("***粗斜体***[链接](<https://example.com/a%20b>)新增"));
    assert!(!out.contains("已删除"));
}

#[test]
fn numbering_uses_definition_start_and_nested_levels() {
    let nums = format!(
        r#"<w:numbering {NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="0"/></w:num></w:numbering>"#
    );
    let item = |level, text| {
        format!(
            r#"<w:p><w:pPr><w:numPr><w:ilvl w:val="{level}"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:t>{text}</w:t></w:r></w:p>"#
        )
    };
    let out = markdown(
        &(item(0, "甲") + &item(1, "乙") + &item(0, "丙")),
        &[("word/numbering.xml", nums.as_bytes())],
    );
    assert_eq!(out, "3. 甲\n\n    - 乙\n\n4. 丙\n\n");
}

#[test]
fn extracts_and_deduplicates_images_with_relative_paths() {
    let rels = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/></Relationships>"#;
    let image = |id| {
        format!(
            r#"<w:p><w:r><w:drawing><wp:docPr descr="图片 [一]"/><a:blip r:embed="{id}"/></w:drawing></w:r></w:p>"#
        )
    };
    let files = unpack(
        convert(
            docx(
                &(image("r1") + &image("r2")),
                &[
                    ("word/_rels/document.xml.rels", rels.as_bytes()),
                    ("word/media/image1.png", b"test-image"),
                    ("word/media/image2.png", b"test-image"),
                ],
            ),
            "../文档.docx",
        )
        .unwrap(),
    );
    assert_eq!(files.len(), 2);
    assert_eq!(files["assets/image-001.png"], b"test-image");
    let md = String::from_utf8(files["文档.md"].clone()).unwrap();
    assert_eq!(md.matches("assets/image-001.png").count(), 2);
    assert!(md.contains(r"![图片 \[一\]](assets/image-001.png)"));
}

#[test]
fn simple_tables_escape_pipes_and_keep_line_breaks() {
    let table = format!("<w:tbl><w:tr>{}{}</w:tr><w:tr>{}<w:tc><w:p><w:r><w:t>甲|乙</w:t><w:br/><w:t>丙</w:t></w:r></w:p></w:tc></w:tr></w:tbl>", tc("列一"), tc("列二"), tc("内容"));
    assert_eq!(
        markdown(&table, &[]),
        "| 列一 | 列二 |\n| --- | --- |\n| 内容 | 甲\\|乙<br>丙 |\n\n"
    );
}

#[test]
fn complex_tables_preserve_colspan_rowspan_and_escape_html() {
    let table = format!(
        r#"<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/></w:tcPr>{}</w:tc>{}</w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge/></w:tcPr><w:p/></w:tc>{}</w:tr></w:tbl>"#,
        p("&lt;script&gt;"),
        tc("甲"),
        tc("乙")
    );
    let out = markdown(&table, &[]);
    assert!(out.contains("<td colspan=\"2\" rowspan=\"2\"><p>&lt;script&gt;</p></td>"));
    assert!(out.contains("<tr><td><p>乙</p></td></tr>"));
    assert!(!out.contains("<script>"));
}

#[test]
fn equations_are_inline_or_display_latex_without_duplicate_text() {
    let out = markdown(
        r#"<w:p><w:r><w:t>公式</w:t></w:r><m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath></w:p><w:p><m:oMathPara><m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath></m:oMathPara></w:p>"#,
        &[],
    );
    assert_eq!(out, "公式${x}^{2}$\n\n$$\n\\frac{1}{2}\n$$\n\n");
}

#[test]
fn unsupported_objects_and_external_images_are_silently_omitted() {
    let rels = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/image.png" TargetMode="External"/></Relationships>"#;
    let out = markdown(
        r#"<w:p><w:r><w:t>保留</w:t><w:drawing><w:txbxContent><w:p><w:r><w:t>文本框</w:t></w:r></w:p></w:txbxContent></w:drawing><w:drawing><c:chart/></w:drawing><w:object><w:t>旧公式</w:t></w:object><w:drawing><a:blip r:embed="r1"/></w:drawing></w:r></w:p>"#,
        &[("word/_rels/document.xml.rels", rels.as_bytes())],
    );
    assert_eq!(out, "保留\n\n");
}

#[test]
fn invalid_documents_and_decompression_bombs_are_rejected() {
    assert!(convert(b"not a zip".to_vec(), "x.docx").is_err());
    assert!(convert(package(&[("unrelated.txt", b"text")]), "x.docx").is_err());
    assert!(convert(docx("<w:p>", &[]), "x.docx").is_err());
    let big_xml = vec![b' '; (MAX_XML + 1) as usize];
    assert!(
        convert(package(&[("word/document.xml", &big_xml)]), "x.docx")
            .unwrap_err()
            .contains("size limit")
    );
}

#[test]
fn resources_and_output_names_cannot_escape_archive() {
    assert_eq!(image_path("../../etc/passwd"), None);
    assert_eq!(image_path("https://example.com/a.png"), None);
    assert_eq!(
        image_path("/word/media/image.png"),
        Some("word/media/image.png".into())
    );
    assert_eq!(safe_stem("../../CON.docx"), "document");
    assert_eq!(safe_stem("测试:文档.docx"), "测试文档");
    assert_eq!(safe_stem(".docx"), "document");
}

#[test]
fn unsafe_links_keep_label_without_exporting_active_content() {
    let rels = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>"#;
    assert_eq!(
        markdown(
            r#"<w:p><w:hyperlink r:id="r1"><w:r><w:t>标题</w:t></w:r></w:hyperlink></w:p>"#,
            &[("word/_rels/document.xml.rels", rels.as_bytes())]
        ),
        "标题\n\n"
    );
}

#[test]
fn accepts_utf16_and_strict_ooxml_namespaces() {
    let xml = r#"<?xml version="1.0" encoding="UTF-16"?><x:document xmlns:x="http://purl.oclc.org/ooxml/wordprocessingml/main"><x:body><x:p><x:r><x:t>中文</x:t></x:r></x:p></x:body></x:document>"#;
    let bytes: Vec<u8> = [0xff, 0xfe]
        .into_iter()
        .chain(xml.encode_utf16().flat_map(u16::to_le_bytes))
        .collect();
    let files = unpack(convert(package(&[("word/document.xml", &bytes)]), "中文.docx").unwrap());
    assert_eq!(files["中文.md"], "中文\n\n".as_bytes());
}

#[test]
fn rejects_dtd_and_excessively_deep_xml() {
    assert!(parse("<!DOCTYPE root [<!ENTITY x 'value'>]><root>&x;</root>").is_err());
    assert!(parse(&format!("{}{}", "<a>".repeat(140), "</a>".repeat(140))).is_err());
}

#[test]
fn adjacent_formatted_runs_do_not_create_broken_emphasis() {
    let out = markdown("<w:p><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>甲</w:t></w:r><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>乙</w:t></w:r><w:r><w:t>丙</w:t></w:r></w:p>", &[]);
    assert_eq!(out, "***甲乙***丙\n\n");
    assert_eq!(table_pipes(r"甲\|乙 $|x|$"), r"甲\|乙 $\|x\|$");
}
