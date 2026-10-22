//! Builds DOM nodes for a tree, detached from the document, so an invalid tree
//! fails before anything is attached.

use js_sys::Array;
use snix_eval::Value;
use web_sys::Document;

use super::node::{self, Element, Node, utf8};
use crate::error::Error;

/// Creates DOM nodes for a list of children.
pub(super) fn children(children: &Value, document: &Document) -> Result<Array, Error> {
    node::children(&children.to_list()?)?
        .iter()
        .map(|child| node(child, document))
        .collect()
}

pub(super) fn node(node: &Node, document: &Document) -> Result<web_sys::Node, Error> {
    match node {
        Node::Element(element) => Ok(self::element(element, document)?.into()),
        Node::Text(text) => Ok(document.create_text_node(utf8(text)?).into()),
    }
}

fn element(element: &Element, document: &Document) -> Result<web_sys::Element, Error> {
    let tag = element.tag()?;
    let created = match element.namespace()? {
        Some(namespace) => document.create_element_ns(Some(utf8(&namespace)?), utf8(&tag)?)?,
        None => document.create_element(utf8(&tag)?)?,
    };
    let attributes = element.attributes()?;
    for name in attributes.names() {
        if let Some(value) = attributes.get(name)? {
            created.set_attribute(utf8(name)?, utf8(&value)?)?;
        }
    }

    for child in &node::children(&element.children()?)? {
        created.append_child(&node(child, document)?)?;
    }

    // After children, so a select's options exist to choose from.
    for property in attributes.properties()? {
        property.set(&created)?;
    }

    Ok(created)
}
