//! Virtual DOM trees, rendered from the nodes `<web/dom>` builds (see
//! `internal/children.nix`).
//!
//! - `node`: views over the Nix values, which stay the source of truth.
//! - `create`: builds DOM nodes for a tree.
//! - `patch`: updates DOM nodes from one tree to the next.
//! - `handlers`: finds event handlers for events in the DOM.
//! - `styles`: loads the CSS of styles in a tree.
//!
//! Either way, an invalid tree fails before the DOM changes.

mod create;
pub(crate) mod handlers;
mod node;
mod patch;
pub(crate) mod styles;

use snix_eval::Value;
use web_sys::Element;

use crate::error::Error;

/// Renders `children` into `container`. With the `previous` children
/// rendered there, the DOM is patched to match. Without, the container's
/// contents are replaced.
pub(crate) fn render(
    container: &Element,
    previous: Option<&Value>,
    children: &Value,
) -> Result<(), Error> {
    let document = container
        .owner_document()
        .ok_or_else(|| Error::Js("Container has no document".to_owned()))?;

    if let Some(previous) = previous {
        return patch::children(container, previous, children, &document);
    }

    let nodes = create::children(children, &document)?;
    container.replace_children_with_node(&nodes);
    Ok(())
}
