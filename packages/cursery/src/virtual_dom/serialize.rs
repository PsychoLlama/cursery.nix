//! Serializes a page to HTML, for server renders. Handlers are dropped, since
//! nothing runs them.
//!
//! Text in `script` would run as written, so scripts can't have children.
//! Text in `style` is written as is, so it can't contain `</style`.

use super::node::{self, Element, Node, utf8};
use crate::error::Error;

/// Elements without children or a closing tag.
/// <https://html.spec.whatwg.org/multipage/syntax.html#void-elements>
const VOID: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track",
    "wbr",
];

/// Serializes `page`, an `html` element, as a document.
pub(crate) fn page(page: &snix_eval::Value) -> Result<String, Error> {
    let root = match Node::from_value(page) {
        Ok(Node::Element(root)) if is_html(&root)? => root,
        _ => {
            return Err(Error::InvalidPage(
                "expected an `html` element, like `html.html`".to_owned(),
            ));
        }
    };

    let mut html = String::from("<!doctype html>");
    element(&root, &mut html)?;
    Ok(html)
}

fn is_html(element: &Element) -> Result<bool, Error> {
    Ok(element.namespace()?.is_none() && element.tag()? == "html")
}

fn node(node: &Node, html: &mut String) -> Result<(), Error> {
    match node {
        Node::Element(element) => self::element(element, html),
        Node::Text(text) => {
            escape(utf8(text)?, &['&', '<', '>'], html);
            Ok(())
        }
    }
}

fn element(element: &Element, html: &mut String) -> Result<(), Error> {
    let tag = element.tag()?;
    let tag = utf8(&tag)?;
    if !tag.starts_with(|c: char| c.is_ascii_alphabetic()) || !is_name(tag) {
        return Err(Error::InvalidNode(format!("invalid tag {tag:?}")));
    }

    html.push('<');
    html.push_str(tag);
    let attributes = element.attributes()?;
    for name in attributes.names() {
        let Some(value) = attributes.get(name)? else {
            continue;
        };

        let name = utf8(name)?;
        if !is_name(name) {
            return Err(Error::InvalidNode(format!(
                "invalid attribute {name:?} on <{tag}>"
            )));
        }

        html.push(' ');
        html.push_str(name);
        html.push_str("=\"");
        escape(utf8(&value)?, &['&', '"'], html);
        html.push('"');
    }

    let children = node::children(&element.children()?)?;
    let foreign = element.namespace()?.is_some();
    if tag == "script" && !children.is_empty() {
        return Err(Error::InvalidNode(
            "<script> can't have children in a server render; use `src`".to_owned(),
        ));
    }

    if foreign && children.is_empty() {
        html.push_str("/>");
        return Ok(());
    }

    html.push('>');
    if !foreign && VOID.contains(&tag) {
        if !children.is_empty() {
            return Err(Error::InvalidNode(format!("<{tag}> can't have children")));
        }

        return Ok(());
    }

    if !foreign && tag == "style" {
        for child in &children {
            let Node::Text(text) = child else {
                return Err(Error::InvalidNode(
                    "<style> can only contain text".to_owned(),
                ));
            };

            let text = utf8(text)?;
            if text.to_ascii_lowercase().contains("</style") {
                return Err(Error::InvalidNode(
                    "<style> can't contain \"</style\"".to_owned(),
                ));
            }

            html.push_str(text);
        }
    } else {
        for child in &children {
            node(child, html)?;
        }
    }

    html.push_str("</");
    html.push_str(tag);
    html.push('>');
    Ok(())
}

/// Whether `name` is safe as a tag or attribute name: nothing that would end
/// it early, or the tag around it.
fn is_name(name: &str) -> bool {
    !name.is_empty()
        && !name.chars().any(|c| {
            c.is_ascii_whitespace()
                || c.is_control()
                || matches!(c, '"' | '\'' | '<' | '>' | '/' | '=')
        })
}

/// Appends `text`, replacing each of `special` with its character reference.
fn escape(text: &str, special: &[char], html: &mut String) {
    for c in text.chars() {
        let reference = match c {
            '&' => "&amp;",
            '<' => "&lt;",
            '>' => "&gt;",
            '"' => "&quot;",
            _ => "",
        };

        if special.contains(&c) {
            html.push_str(reference);
        } else {
            html.push(c);
        }
    }
}
