//! Views over the Nix values `<web/dom>` builds. Reading one copies pointers,
//! never contents.

use snix_eval::{NixAttrs, NixList, NixString, Value};

use crate::error::Error;

pub(super) enum Node {
    Element(Element),
    Text(NixString),
}

impl Node {
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
    pub(super) fn tag(&self) -> Result<NixString, Error> {
        string(field(&self.0, "tag")?)
    }

    pub(super) fn attributes(&self) -> Result<Attributes, Error> {
        Ok(Attributes(field(&self.0, "attrs")?.to_attrs()?))
    }

    pub(super) fn children(&self) -> Result<NixList, Error> {
        Ok(field(&self.0, "children")?.to_list()?)
    }

    pub(super) fn handlers(&self) -> Result<Handlers, Error> {
        Ok(Handlers(field(&self.0, "on")?.to_attrs()?))
    }
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
pub(super) struct Attributes(NixAttrs);

impl Attributes {
    /// Every name, sorted, including omitted attributes.
    pub(super) fn names(&self) -> impl Iterator<Item = &NixString> {
        self.0.keys_sorted()
    }

    /// Whether `name` is present, even if omitted.
    pub(super) fn contains(&self, name: &NixString) -> bool {
        self.0.select(name).is_some()
    }

    /// The value of `name`, or `None` if it's omitted.
    pub(super) fn get(&self, name: &NixString) -> Result<Option<NixString>, Error> {
        match self.0.select(name).map(forced) {
            None | Some(Value::Null) => Ok(None),
            Some(value) => Ok(Some(string(&value)?)),
        }
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
