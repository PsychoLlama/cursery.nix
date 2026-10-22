//! Event handlers in a tree, for events delegated to its container.
//!
//! Each node in the tree is rendered as one DOM node, in order, so a DOM
//! node's position in the container finds its node in the tree.

use std::collections::BTreeSet;

use snix_eval::{NixList, Value};
use wasm_bindgen::JsCast;
use web_sys::Event;

use super::node::{Node, utf8};
use crate::error::Error;

/// Every event type with a handler in `children`.
pub(crate) fn types(children: &Value) -> Result<BTreeSet<String>, Error> {
    let mut types = BTreeSet::new();
    collect(&children.to_list()?, &mut types)?;
    Ok(types)
}

fn collect(children: &NixList, types: &mut BTreeSet<String>) -> Result<(), Error> {
    for child in children {
        if let Node::Element(element) = Node::from_value(child)? {
            for name in element.handlers()?.types() {
                types.insert(utf8(name)?.to_owned());
            }

            collect(&element.children()?, types)?;
        }
    }

    Ok(())
}

/// Handlers in `children`, rendered into `container`, in the order `event`
/// reaches them: from its target out to the container, like bubbling, or only
/// the target's for events that don't bubble.
pub(crate) fn find(
    container: &web_sys::Node,
    children: &Value,
    event: &Event,
) -> Result<Vec<Value>, Error> {
    let Some(path) = event
        .target()
        .and_then(|target| target.dyn_into().ok())
        .and_then(|target| path(container, target))
    else {
        return Ok(Vec::new());
    };

    // Handlers from the container down, `None` for nodes without one.
    let event_type = event.type_();
    let mut handlers = Vec::new();
    let mut children = children.to_list()?;
    for index in path.iter().rev() {
        // Anything else in the container isn't ours to handle.
        let Some(child) = children.get(*index) else {
            return Ok(Vec::new());
        };

        let Node::Element(element) = Node::from_value(child)? else {
            break;
        };

        handlers.push(element.handlers()?.get(&event_type));
        children = element.children()?;
    }

    if !event.bubbles() {
        let reached = handlers.len() == path.len();
        handlers = handlers.pop().filter(|_| reached).into_iter().collect();
    }

    Ok(handlers.into_iter().rev().flatten().collect())
}

/// Child indices from `node` up to `container`, or `None` if `node` isn't
/// inside it.
fn path(container: &web_sys::Node, mut node: web_sys::Node) -> Option<Vec<usize>> {
    let mut path = Vec::new();
    while node != *container {
        let parent = node.parent_node()?;
        path.push(index(&node));
        node = parent;
    }

    Some(path)
}

/// Position of `node` among its siblings.
fn index(node: &web_sys::Node) -> usize {
    let mut index = 0;
    let mut sibling = node.previous_sibling();
    while let Some(node) = sibling {
        index += 1;
        sibling = node.previous_sibling();
    }

    index
}
