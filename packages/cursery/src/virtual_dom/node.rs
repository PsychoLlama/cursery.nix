//! Views over the Nix values `<web/dom>` builds. Reading one copies pointers,
//! never contents.

use std::collections::HashSet;

use js_sys::Reflect;
use snix_eval::{NixAttrs, NixList, NixString, Value};
use wasm_bindgen::JsValue;

use crate::error::Error;

pub(super) enum Node {
    Element(Element),
    Text(NixString),
}

impl Node {
    /// Identifies the node among its siblings. Text nodes have no key.
    pub(super) fn key(&self) -> Result<Option<NixString>, Error> {
        match self {
            Self::Element(element) => element.key(),
            Self::Text(_) => Ok(None),
        }
    }

    pub(super) fn from_value(value: &Value) -> Result<Self, Error> {
        let node = value.to_attrs()?;
        match utf8(&string(field(&node, "_type")?)?)? {
            "element" => Ok(Self::Element(Element(node))),
            "text" => Ok(Self::Text(string(field(&node, "text")?)?)),
            other => Err(Error::InvalidNode(format!("unknown node type {other:?}"))),
        }
    }
}

pub(super) struct Element(NixAttrs);

impl Element {
    pub(super) fn key(&self) -> Result<Option<NixString>, Error> {
        match forced(field(&self.0, "key")?) {
            Value::Null => Ok(None),
            value => Ok(Some(string(&value)?)),
        }
    }

    pub(super) fn tag(&self) -> Result<NixString, Error> {
        string(field(&self.0, "tag")?)
    }

    /// The namespace of SVG and other non-HTML elements, or `None` for HTML.
    pub(super) fn namespace(&self) -> Result<Option<NixString>, Error> {
        match self.0.select("namespace").map(forced) {
            None | Some(Value::Null) => Ok(None),
            Some(value) => Ok(Some(string(&value)?)),
        }
    }

    /// Whether `other` can be patched into this element: the same tag, in
    /// the same namespace.
    pub(super) fn is_same_kind(&self, other: &Self) -> Result<bool, Error> {
        Ok(self.tag()? == other.tag()? && self.namespace()? == other.namespace()?)
    }

    pub(super) fn attributes(&self) -> Result<Attributes, Error> {
        Ok(Attributes {
            attrs: field(&self.0, "attrs")?.to_attrs()?,
            properties: if self.namespace()?.is_some() {
                &[]
            } else {
                properties(utf8(&self.tag()?)?)
            },
        })
    }

    pub(super) fn children(&self) -> Result<NixList, Error> {
        Ok(field(&self.0, "children")?.to_list()?)
    }

    pub(super) fn handlers(&self) -> Result<Handlers, Error> {
        Ok(Handlers(field(&self.0, "on")?.to_attrs()?))
    }

    /// The CSS of styles in its `class`, by class name.
    pub(super) fn styles(&self) -> Result<Vec<(NixString, NixString)>, Error> {
        field(&self.0, "styles")?
            .to_attrs()?
            .iter()
            .map(|(name, css)| Ok((name.clone(), string(&forced(css))?)))
            .collect()
    }
}

/// Reads a list of children, checking that their keys are unique.
pub(super) fn children(children: &NixList) -> Result<Vec<Node>, Error> {
    let mut keys = HashSet::new();
    children
        .iter()
        .map(|child| {
            let node = Node::from_value(child)?;
            if let Some(key) = node.key()?
                && !keys.insert(key.clone())
            {
                return Err(Error::InvalidNode(format!("duplicate key {key}")));
            }

            Ok(node)
        })
        .collect()
}

/// Handlers are functions, or null for none.
pub(super) struct Handlers(NixAttrs);

impl Handlers {
    /// Every event type, including those without a handler.
    pub(super) fn types(&self) -> impl Iterator<Item = &NixString> {
        self.0.keys()
    }

    /// The handler for events of type `name`, if any.
    pub(super) fn get(&self, name: &str) -> Option<Value> {
        self.0
            .select(name)
            .map(forced)
            .filter(|handler| !matches!(handler, Value::Null))
    }
}

/// Attribute values are strings, or null to omit them.
///
/// Some are set as properties instead (see [`properties`]). The rest are
/// attributes proper.
pub(super) struct Attributes {
    attrs: NixAttrs,
    properties: &'static [&'static str],
}

impl Attributes {
    /// Every attribute name, sorted, including omitted attributes.
    pub(super) fn names(&self) -> impl Iterator<Item = &NixString> {
        self.attrs.keys_sorted().filter(|name| {
            !self
                .properties
                .iter()
                .any(|property| name.as_bytes() == property.as_bytes())
        })
    }

    /// Whether `name` is present, even if omitted.
    pub(super) fn contains(&self, name: &NixString) -> bool {
        self.attrs.select(name).is_some()
    }

    /// The value of `name`, or `None` if it's omitted.
    pub(super) fn get(&self, name: &NixString) -> Result<Option<NixString>, Error> {
        match self.attrs.select(name).map(forced) {
            None | Some(Value::Null) => Ok(None),
            Some(value) => Ok(Some(string(&value)?)),
        }
    }

    /// Properties to set. Absent ones are left as they are, so the element
    /// keeps whatever people did to it.
    pub(super) fn properties(&self) -> Result<Vec<Property>, Error> {
        let mut properties = Vec::new();
        for &name in self.properties {
            let Some(value) = self.attrs.select(name).map(forced) else {
                continue;
            };

            let value = match (name, value) {
                // Booleans arrive as `""` for true and null for false.
                ("checked" | "selected", value) => {
                    JsValue::from_bool(!matches!(value, Value::Null))
                }
                (_, Value::Null) => JsValue::from_str(""),
                (_, value) => JsValue::from_str(utf8(&string(&value)?)?),
            };

            properties.push(Property { name, value });
        }

        Ok(properties)
    }
}

/// An attribute set as a property.
pub(super) struct Property {
    name: &'static str,
    value: JsValue,
}

impl Property {
    /// Sets the property on `element`, unless it already holds the value.
    /// Setting an input's value moves the caret, even to the same value.
    pub(super) fn set(&self, element: &web_sys::Element) -> Result<(), Error> {
        let name = JsValue::from_str(self.name);
        if Reflect::get(element, &name)? != self.value {
            Reflect::set(element, &name, &self.value)?;
        }

        Ok(())
    }
}

/// Attributes of `tag` set as properties. Their attributes are only defaults
/// (an input's `value` attribute doesn't change as people type), so the
/// properties hold what the element shows now.
fn properties(tag: &str) -> &'static [&'static str] {
    match tag {
        "input" => &["checked", "value"],
        "textarea" | "select" => &["value"],
        "option" => &["selected"],
        _ => &[],
    }
}

pub(super) fn utf8(string: &NixString) -> Result<&str, Error> {
    str::from_utf8(string.as_bytes()).map_err(|_| Error::InvalidUtf8)
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
