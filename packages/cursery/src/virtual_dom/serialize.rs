//! Serializes a page to HTML, for server renders. Handlers are dropped, since
//! nothing runs them.
//!
//! Text in `script` would run as written, so scripts can't have children.
//! Text in `style` is written as is, so it can't contain `</style`.
//!
//! Attributes the DOM sets as properties are written as what they show: an
//! input's `value` and `checked` as attributes, a textarea's `value` as its
//! text, and a select's `value` as `selected` on its first matching option.

use snix_eval::NixString;

use super::node::{self, Attributes, Element, Node, utf8};
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
    element(&root, &mut None, &mut html)?;
    Ok(html)
}

fn is_html(element: &Element) -> Result<bool, Error> {
    Ok(element.namespace()?.is_none() && element.tag()? == "html")
}

/// The value of the select an option is in, if it has one.
struct Select {
    value: String,

    /// Whether an earlier option matched. Only the first is selected.
    matched: bool,
}

fn node(node: &Node, select: &mut Option<Select>, html: &mut String) -> Result<(), Error> {
    match node {
        Node::Element(element) => self::element(element, select, html),
        Node::Text(text) => {
            escape(utf8(text)?, &['&', '<', '>'], html);
            Ok(())
        }
    }
}

fn element(element: &Element, select: &mut Option<Select>, html: &mut String) -> Result<(), Error> {
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

        attribute(utf8(name)?, utf8(&value)?, tag, html)?;
    }

    let properties = attributes.properties()?;
    let property = |name| {
        properties
            .iter()
            .find(|property| property.name == name)
            .map(|property| property.value.as_ref())
    };

    match tag {
        "option" => {
            let selected = match select {
                Some(select) => {
                    let selected =
                        !select.matched && option_value(element, &attributes)? == select.value;
                    select.matched |= selected;
                    selected
                }
                None => property("selected").flatten().is_some(),
            };

            if selected {
                attribute("selected", "", tag, html)?;
            }
        }
        "select" | "textarea" => {}
        _ => {
            for property in &properties {
                if let Some(value) = &property.value {
                    attribute(property.name, utf8(value)?, tag, html)?;
                }
            }
        }
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

    let content = html.len();
    if !foreign && tag == "style" {
        style(&children, html)?;
    } else if let Some(value) = property("value").filter(|_| tag == "textarea") {
        escape(value.map_or(Ok(""), utf8)?, &['&', '<', '>'], html);
    } else if let Some(value) = property("value").filter(|_| tag == "select") {
        let mut select = Some(Select {
            value: value.map_or(Ok(""), utf8)?.to_owned(),
            matched: false,
        });

        for child in &children {
            node(child, &mut select, html)?;
        }
    } else {
        for child in &children {
            node(child, select, html)?;
        }
    }

    // Parsers drop a newline right after these start tags, so a leading one
    // needs another to survive.
    if !foreign
        && matches!(tag, "pre" | "textarea" | "listing")
        && html[content..].starts_with('\n')
    {
        html.insert(content, '\n');
    }

    html.push_str("</");
    html.push_str(tag);
    html.push('>');
    Ok(())
}

/// Writes a style's text as is, so it can't close the style early.
fn style(children: &[Node], html: &mut String) -> Result<(), Error> {
    for child in children {
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

    Ok(())
}

fn attribute(name: &str, value: &str, tag: &str, html: &mut String) -> Result<(), Error> {
    if !is_name(name) {
        return Err(Error::InvalidNode(format!(
            "invalid attribute {name:?} on <{tag}>"
        )));
    }

    html.push(' ');
    html.push_str(name);
    html.push_str("=\"");
    escape(value, &['&', '"'], html);
    html.push('"');
    Ok(())
}

/// The value an option submits: its `value`, or else its text, with
/// whitespace collapsed.
fn option_value(element: &Element, attributes: &Attributes) -> Result<String, Error> {
    if let Some(value) = attributes.get(&NixString::from("value"))? {
        return Ok(utf8(&value)?.to_owned());
    }

    let mut text = String::new();
    for child in &node::children(&element.children()?)? {
        if let Node::Text(child) = child {
            text.push_str(utf8(child)?);
        }
    }

    Ok(text.split_ascii_whitespace().collect::<Vec<_>>().join(" "))
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
