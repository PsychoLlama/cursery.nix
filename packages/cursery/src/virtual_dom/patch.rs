//! Updates DOM nodes from one tree to the next.
//!
//! Keyed children are matched by key, and the rest by position among the
//! unkeyed. Matched nodes are patched in place and moved as little as
//! possible, keeping focus and other state the DOM holds. Every change is
//! planned before any is made, so an invalid tree leaves the DOM untouched.
//!
//! Attributes are diffed against the old tree. Properties (an input's
//! `value`) are compared with the element instead, since people change them.

use std::collections::{HashMap, VecDeque};

use snix_eval::{NixList, Value};
use wasm_bindgen::JsCast;
use web_sys::Document;

use super::{
    create,
    node::{self, Attributes, Node, Property, utf8},
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
    SetProperty(web_sys::Element, Property),
    SetText(web_sys::Node, String),
    /// Parent, node, and the sibling to insert it before (or append).
    Insert(web_sys::Node, web_sys::Node, Option<web_sys::Node>),
    /// Parent, old child, new child.
    Replace(web_sys::Node, web_sys::Node, web_sys::Node),
    Remove(web_sys::Node, web_sys::Node),
}

impl Change {
    fn apply(self) -> Result<(), Error> {
        match self {
            Self::SetAttribute(element, name, value) => element.set_attribute(&name, &value)?,
            Self::RemoveAttribute(element, name) => element.remove_attribute(&name)?,
            Self::SetProperty(element, property) => property.set(&element)?,
            Self::SetText(node, text) => node.set_node_value(Some(&text)),
            Self::Insert(parent, node, before) => {
                parent.insert_before(&node, before.as_ref())?;
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
        let old = node::children(old)?;
        let new = node::children(new)?;

        // The DOM matches the old tree, node for node.
        let mut dom = Vec::new();
        let mut next = parent.first_child();
        while let Some(node) = next {
            next = node.next_sibling();
            dom.push(node);
        }

        let mut keyed = HashMap::new();
        let mut unkeyed = VecDeque::new();
        for (index, node) in old.iter().enumerate().take(dom.len()) {
            if let Some(key) = node.key()? {
                keyed.insert(key, index);
            } else {
                unkeyed.push_back(index);
            }
        }

        // Each new child's DOM node, and which old child it was.
        let mut placed = Vec::new();
        let mut reused = vec![false; dom.len()];
        for new in &new {
            let index = match new.key()? {
                Some(key) => keyed.remove(&key),
                None => unkeyed.pop_front(),
            };

            if let Some(index) = index {
                reused[index] = true;
                let node = self.node(parent, dom[index].clone(), &old[index], new)?;
                placed.push((node, Some(index)));
            } else {
                placed.push((create::node(new, self.document)?, None));
            }
        }

        for (node, reused) in dom.into_iter().zip(reused) {
            if !reused {
                self.changes.push(Change::Remove(parent.clone(), node));
            }
        }

        // The longest run of old children still in order stays put. The rest
        // are inserted around them, from the end, before their next sibling.
        let staying = increasing(&placed.iter().map(|(_, index)| *index).collect::<Vec<_>>());
        let mut before = None;
        for ((node, _), staying) in placed.into_iter().zip(staying).rev() {
            if !staying {
                self.changes
                    .push(Change::Insert(parent.clone(), node.clone(), before));
            }

            before = Some(node);
        }

        Ok(())
    }

    /// Patches `dom`, rendered from `old`, to match `new`, returning the node
    /// that ends up in its place.
    fn node(
        &mut self,
        parent: &web_sys::Node,
        dom: web_sys::Node,
        old: &Node,
        new: &Node,
    ) -> Result<web_sys::Node, Error> {
        match (old, new) {
            (Node::Text(old), Node::Text(new)) => {
                if old != new {
                    self.changes
                        .push(Change::SetText(dom.clone(), utf8(new)?.to_owned()));
                }
            }
            (Node::Element(old), Node::Element(new)) if old.is_same_kind(new)? => {
                let element: web_sys::Element = dom.clone().unchecked_into();
                let attributes = new.attributes()?;
                self.attributes(&element, &old.attributes()?, &attributes)?;
                self.children(&element, &old.children()?, &new.children()?)?;

                // Compared with the element when applied, not the old tree:
                // people change them. After children, like creating.
                for property in attributes.properties()? {
                    self.changes
                        .push(Change::SetProperty(element.clone(), property));
                }
            }
            (_, new) => {
                let node = create::node(new, self.document)?;
                self.changes
                    .push(Change::Replace(parent.clone(), dom, node.clone()));
                return Ok(node);
            }
        }

        Ok(dom)
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

/// Marks a longest strictly increasing run in `sequence`, skipping `None`.
fn increasing(sequence: &[Option<usize>]) -> Vec<bool> {
    // `ends[length - 1]` is the position ending the run of `length` with the
    // smallest last value, and `previous` links each position to the one
    // before it in its run.
    let mut ends: Vec<usize> = Vec::new();
    let mut previous = vec![None; sequence.len()];
    for (position, value) in sequence.iter().enumerate() {
        if value.is_none() {
            continue;
        }

        let length = ends.partition_point(|&end| sequence[end] < *value);
        previous[position] = length.checked_sub(1).map(|length| ends[length]);
        if length == ends.len() {
            ends.push(position);
        } else {
            ends[length] = position;
        }
    }

    let mut marked = vec![false; sequence.len()];
    let mut next = ends.last().copied();
    while let Some(position) = next {
        marked[position] = true;
        next = previous[position];
    }

    marked
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_increasing_runs() {
        let marked = |sequence: &[Option<usize>]| -> Vec<usize> {
            increasing(sequence)
                .iter()
                .enumerate()
                .filter_map(|(position, marked)| marked.then_some(position))
                .collect()
        };

        assert_eq!(marked(&[]), Vec::<usize>::new());
        assert_eq!(marked(&[Some(0), Some(1), Some(2)]), [0, 1, 2]);
        assert_eq!(marked(&[Some(2), Some(0), Some(1)]), [1, 2]);
        assert_eq!(marked(&[Some(1), Some(2), Some(0)]), [0, 1]);
        assert_eq!(marked(&[Some(3), None, Some(1), Some(2), None]), [2, 3]);
        assert_eq!(marked(&[None, None]), Vec::<usize>::new());
    }
}
