//! Virtual DOM trees, read in place from the nodes `<web/dom>` builds (see
//! `internal/children.nix`).
//!
//! The Nix values are the source of truth: these types are views over them,
//! and reading one copies pointers, never contents.

use js_sys::Array;
use snix_eval::{NixAttrs, NixList, NixString, Value};
use web_sys::Document;

use crate::error::Error;

pub(crate) enum Node {
    Element(Element),
    Text(NixString),
}

impl Node {
    fn from_value(value: &Value) -> Result<Self, Error> {
        let node = value.to_attrs()?;
        match utf8(&string(field(&node, "_type")?)?)? {
            "element" => Ok(Self::Element(Element(node))),
            "text" => Ok(Self::Text(string(field(&node, "text")?)?)),
            other => Err(Error::InvalidNode(format!("unknown node type {other:?}"))),
        }
    }

    /// Creates a DOM node, detached from the document.
    fn create(&self, document: &Document) -> Result<web_sys::Node, Error> {
        match self {
            Self::Element(element) => Ok(element.create(document)?.into()),
            Self::Text(text) => Ok(document.create_text_node(utf8(text)?).into()),
        }
    }
}

pub(crate) struct Element(NixAttrs);

impl Element {
    fn tag(&self) -> Result<NixString, Error> {
        string(field(&self.0, "tag")?)
    }

    /// Attribute values are strings, or null to omit them.
    fn attributes(&self) -> Result<NixAttrs, Error> {
        Ok(field(&self.0, "attrs")?.to_attrs()?)
    }

    fn children(&self) -> Result<NixList, Error> {
        Ok(field(&self.0, "children")?.to_list()?)
    }

    fn create(&self, document: &Document) -> Result<web_sys::Element, Error> {
        let element = document.create_element(utf8(&self.tag()?)?)?;
        for (name, value) in self.attributes()?.iter_sorted() {
            match forced(value) {
                Value::Null => {}
                value => element.set_attribute(utf8(name)?, utf8(&string(&value)?)?)?,
            }
        }

        for child in &self.children()? {
            element.append_child(&Node::from_value(child)?.create(document)?)?;
        }

        Ok(element)
    }
}

/// Creates DOM nodes for a list of children, detached from the document, so
/// an invalid tree fails before anything is attached.
pub(crate) fn create_children(children: &Value, document: &Document) -> Result<Array, Error> {
    children
        .to_list()?
        .iter()
        .map(|child| Node::from_value(child)?.create(document))
        .collect()
}

/// Sees through thunks, which strict evaluation has already forced.
fn forced(value: &Value) -> Value {
    match value {
        Value::Thunk(thunk) => thunk.value().clone(),
        value => value.clone(),
    }
}

fn field<'a>(node: &'a NixAttrs, name: &str) -> Result<&'a Value, Error> {
    node.select(name)
        .ok_or_else(|| Error::InvalidNode(format!("missing {name:?}")))
}

fn string(value: &Value) -> Result<NixString, Error> {
    Ok(value.to_str()?)
}

fn utf8(string: &NixString) -> Result<&str, Error> {
    str::from_utf8(string.as_bytes()).map_err(|_| Error::InvalidUtf8)
}
