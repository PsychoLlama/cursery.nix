//! Updates DOM nodes from one tree to the next.
//!
//! Children are matched by position: `key` is ignored for now. Every change
//! is planned before any is made, so an invalid tree leaves the DOM untouched.

use snix_eval::{NixList, Value};
use wasm_bindgen::JsCast;
use web_sys::Document;

use super::{
    create,
    node::{Attributes, Node, utf8},
};
use crate::error::Error;

/// Patches the children of `parent`, rendered from `old`, to match `new`.
pub(super) fn children(
    parent: &web_sys::Node,
    old: &Value,
    new: &Value,
    document: &Document,
) -> Result<(), Error> {
    let mut plan = Plan {
        document,
        changes: Vec::new(),
    };

    plan.children(parent, &old.to_list()?, &new.to_list()?)?;
    plan.changes.into_iter().try_for_each(Change::apply)
}

enum Change {
    SetAttribute(web_sys::Element, String, String),
    RemoveAttribute(web_sys::Element, String),
    SetText(web_sys::Node, String),
    Append(web_sys::Node, web_sys::Node),
    /// Parent, old child, new child.
    Replace(web_sys::Node, web_sys::Node, web_sys::Node),
    Remove(web_sys::Node, web_sys::Node),
}

impl Change {
    fn apply(self) -> Result<(), Error> {
        match self {
            Self::SetAttribute(element, name, value) => element.set_attribute(&name, &value)?,
            Self::RemoveAttribute(element, name) => element.remove_attribute(&name)?,
            Self::SetText(node, text) => node.set_node_value(Some(&text)),
            Self::Append(parent, node) => {
                parent.append_child(&node)?;
            }
            Self::Replace(parent, old, new) => {
                parent.replace_child(&new, &old)?;
            }
            Self::Remove(parent, node) => {
                parent.remove_child(&node)?;
            }
        }

        Ok(())
    }
}

struct Plan<'a> {
    document: &'a Document,
    changes: Vec<Change>,
}

impl Plan<'_> {
    fn children(
        &mut self,
        parent: &web_sys::Node,
        old: &NixList,
        new: &NixList,
    ) -> Result<(), Error> {
        let mut old = old.iter();
        let mut dom = parent.first_child();
        for new in new {
            if let (Some(old), Some(node)) = (old.next(), dom.clone()) {
                dom = node.next_sibling();
                self.node(parent, node, old, new)?;
            } else {
                let node = create::node(&Node::from_value(new)?, self.document)?;
                self.changes.push(Change::Append(parent.clone(), node));
            }
        }

        while let Some(node) = dom {
            dom = node.next_sibling();
            self.changes.push(Change::Remove(parent.clone(), node));
        }

        Ok(())
    }

    fn node(
        &mut self,
        parent: &web_sys::Node,
        dom: web_sys::Node,
        old: &Value,
        new: &Value,
    ) -> Result<(), Error> {
        match (Node::from_value(old)?, Node::from_value(new)?) {
            (Node::Text(old), Node::Text(new)) => {
                if old != new {
                    self.changes
                        .push(Change::SetText(dom, utf8(&new)?.to_owned()));
                }
            }
            (Node::Element(old), Node::Element(new)) if old.tag()? == new.tag()? => {
                let element: web_sys::Element = dom.unchecked_into();
                self.attributes(&element, &old.attributes()?, &new.attributes()?)?;
                self.children(&element, &old.children()?, &new.children()?)?;
            }
            (_, new) => {
                let node = create::node(&new, self.document)?;
                self.changes
                    .push(Change::Replace(parent.clone(), dom, node));
            }
        }

        Ok(())
    }

    fn attributes(
        &mut self,
        element: &web_sys::Element,
        old: &Attributes,
        new: &Attributes,
    ) -> Result<(), Error> {
        let removed = old.names().filter(|name| !new.contains(name));
        for name in new.names().chain(removed) {
            let value = new.get(name)?;
            if old.get(name)? == value {
                continue;
            }

            let name = utf8(name)?.to_owned();
            match value {
                Some(value) => {
                    // Throws on invalid names, as setting it would.
                    self.document.create_attribute(&name)?;
                    let value = utf8(&value)?.to_owned();
                    self.changes
                        .push(Change::SetAttribute(element.clone(), name, value));
                }
                None => self
                    .changes
                    .push(Change::RemoveAttribute(element.clone(), name)),
            }
        }

        Ok(())
    }
}
