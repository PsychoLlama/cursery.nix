//! The CSS of styles in a tree (see `<web/style>`), loaded into a constructed
//! stylesheet adopted by the container's root: its shadow root, or else its
//! document, even while the container is detached.
//!
//! Each class is loaded once and never removed. Names are hashes of their
//! rules, so an edited style is a new class, and the old one is only a rule
//! nothing matches.

use std::{cell::RefCell, collections::HashMap};

use js_sys::{Array, Reflect};
use snix_eval::{NixList, NixString, Value};
use wasm_bindgen::{JsCast, JsValue};
use web_sys::{CssStyleSheet, Document, Element};

use super::node::{Node, utf8};
use crate::error::Error;

thread_local! {
    static STYLES: RefCell<Option<Styles>> = const { RefCell::new(None) };
}

struct Styles {
    /// Constructed sheets can only be adopted in the document they belong to.
    document: Document,
    sheet: CssStyleSheet,

    /// The CSS of each class loaded so far.
    loaded: HashMap<NixString, NixString>,
}

/// Loads the CSS of every style in `children`, rendered into `container`,
/// that isn't loaded already.
///
/// # Errors
///
/// Fails if different styles share a name, or the CSS doesn't parse.
pub(crate) fn load(container: &Element, children: &Value) -> Result<(), Error> {
    let mut styles = Vec::new();
    collect(&children.to_list()?, &mut styles)?;
    if styles.is_empty() {
        return Ok(());
    }

    let document = container
        .owner_document()
        .ok_or_else(|| Error::Js("Container has no document".to_owned()))?;

    STYLES.with_borrow_mut(|current| {
        let state = match current.take() {
            Some(existing) if existing.document == document => current.insert(existing),
            _ => current.insert(Styles {
                document,
                sheet: CssStyleSheet::new()?,
                loaded: HashMap::new(),
            }),
        };

        for (name, css) in styles {
            match state.loaded.get(&name) {
                Some(loaded) if *loaded == css => {}
                Some(_) => return Err(Error::StyleCollision(utf8(&name)?.to_owned())),
                None => {
                    let class = utf8(&name)?;
                    let index = state.sheet.css_rules()?.length();
                    state
                        .sheet
                        .insert_rule_with_index(utf8(&css)?, index)
                        .map_err(|error| {
                            Error::InvalidStyle(class.to_owned(), Box::new(error.into()))
                        })?;
                    state.loaded.insert(name, css);
                }
            }
        }

        let root = container.get_root_node();
        if Reflect::has(&root, &adopted())? {
            adopt(&root, &state.sheet)
        } else {
            adopt(&state.document, &state.sheet)
        }
    })
}

/// Adds `sheet` to the `adoptedStyleSheets` of `root`, a document or shadow
/// root, unless it's there already. Assigned rather than pushed to: older
/// browsers froze the array.
fn adopt(root: &web_sys::Node, sheet: &CssStyleSheet) -> Result<(), Error> {
    let sheets: Array = Reflect::get(root, &adopted())?
        .dyn_into()
        .map_err(|_| Error::Js("adoptedStyleSheets isn't supported".to_owned()))?;

    if !sheets.includes(sheet, 0) {
        let sheets = sheets.slice(0, sheets.length());
        sheets.push(sheet);
        Reflect::set(root, &adopted(), &sheets)?;
    }

    Ok(())
}

fn adopted() -> JsValue {
    JsValue::from_str("adoptedStyleSheets")
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
