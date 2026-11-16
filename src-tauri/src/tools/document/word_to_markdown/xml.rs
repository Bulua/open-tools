//! DOCX XML 的命名空间和有界解析。
use roxmltree::{Document, Node, ParsingOptions};

pub(super) fn parse(text: &str) -> Result<Document<'_>, String> {
    let doc = Document::parse_with_options(
        text,
        ParsingOptions {
            nodes_limit: 500_000,
            ..ParsingOptions::default()
        },
    )
    .map_err(|e| format!("Invalid DOCX XML: {e}"))?;
    if doc
        .descendants()
        .any(|n| n.ancestors().take(130).count() > 128)
    {
        return Err("DOCX XML is too deeply nested".into());
    }
    Ok(doc)
}

pub(super) fn is(node: Node<'_, '_>, name: &str) -> bool {
    if !node.is_element() || node.tag_name().name() != name {
        return false;
    }
    let ns = node.tag_name().namespace().unwrap_or("");
    ns.starts_with("http://schemas.openxmlformats.org/")
        || ns.starts_with("http://purl.oclc.org/ooxml/")
        || ns == "urn:schemas-microsoft-com:vml"
}

pub(super) fn child<'a, 'i>(node: Node<'a, 'i>, name: &str) -> Option<Node<'a, 'i>> {
    node.children().find(|n| is(*n, name))
}

pub(super) fn attr<'a>(node: Node<'a, '_>, name: &str) -> Option<&'a str> {
    node.attributes()
        .find(|a| a.name() == name)
        .map(|a| a.value())
}

pub(super) fn val<'a>(node: Node<'a, '_>, name: &str) -> Option<&'a str> {
    child(node, name).and_then(|n| attr(n, "val"))
}

pub(super) fn enabled(node: Node<'_, '_>, name: &str) -> Option<bool> {
    child(node, name).map(|n| !matches!(attr(n, "val"), Some("0" | "false" | "off" | "none")))
}

pub(super) fn html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
