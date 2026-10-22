//! The CSS of styles in a tree (see `<web/style>`), loaded into a `<style>`
//! in the document's `<head>`.
//!
//! Each class is loaded once and never removed. Names are hashes of their
//! rules, so an edited style is a new class, and the old one is only a rule
//! nothing matches.

use std::{cell::RefCell, collections::HashSet};

use snix_eval::{NixList, NixString, Value};
use web_sys::{Document, Element};

use super::node::{Node, utf8};
use crate::error::Error;

thread_local! {
    static SHEET: RefCell<Option<Sheet>> = const { RefCell::new(None) };
}

struct Sheet {
    element: Element,

    /// Classes already loaded.
    names: HashSet<NixString>,
}

/// Loads the CSS of every style in `children`, rendered into `container`,
/// that isn't loaded already.
pub(crate) fn load(container: &Element, children: &Value) -> Result<(), Error> {
    let mut styles = Vec::new();
    collect(&children.to_list()?, &mut styles)?;
    if styles.is_empty() {
        return Ok(());
    }

    let document = container
        .owner_document()
        .ok_or_else(|| Error::Js("Container has no document".to_owned()))?;

    SHEET.with_borrow_mut(|sheet| {
        // Starts over if the sheet was removed, or belongs to another document.
        let current = sheet.take().filter(|sheet| {
            sheet.element.is_connected()
                && sheet.element.owner_document().as_ref() == Some(&document)
        });

        let sheet = sheet.insert(match current {
            Some(sheet) => sheet,
            None => Sheet::new(&document)?,
        });

        for (name, css) in styles {
            if sheet.names.insert(name) {
                let text = document.create_text_node(&format!("{}\n", utf8(&css)?));
                sheet.element.append_child(&text)?;
            }
        }

        Ok(())
    })
}

impl Sheet {
    fn new(document: &Document) -> Result<Self, Error> {
        let head = document
            .head()
            .ok_or_else(|| Error::Js("Document has no <head>".to_owned()))?;

        let element = document.create_element("style")?;
        element.set_attribute("data-cursery", "")?;
        head.append_child(&element)?;

        Ok(Self {
            element,
            names: HashSet::new(),
        })
    }
}

/// Styles in `children`, in tree order.
fn collect(children: &NixList, styles: &mut Vec<(NixString, NixString)>) -> Result<(), Error> {
    for child in children {
        if let Node::Element(element) = Node::from_value(child)? {
            styles.extend(element.styles()?);
            collect(&element.children()?, styles)?;
        }
    }

    Ok(())
}
