//! Apps mounted into containers, keyed by container.
//!
//! Mounting into an occupied container updates the app in place, e.g. after
//! a hot reload, patching the DOM rather than replacing it.

use std::cell::RefCell;

use snix_eval::Value;
use web_sys::Element;

use crate::error::Error;

thread_local! {
    /// wasm is single-threaded, so this is effectively a global.
    static MOUNTS: RefCell<Vec<Mount>> = const { RefCell::new(Vec::new()) };
}

#[derive(Debug)]
struct Mount {
    container: Element,

    /// The children last rendered into the container.
    tree: Value,
}

/// The children last rendered into `container`, if anything is mounted.
pub(crate) fn tree(container: &Element) -> Option<Value> {
    MOUNTS.with_borrow(|mounts| {
        mounts
            .iter()
            .find(|mount| &mount.container == container)
            .map(|mount| mount.tree.clone())
    })
}

/// Records `tree` as rendered into `container`.
pub(crate) fn insert(container: &Element, tree: Value) {
    MOUNTS.with_borrow_mut(|mounts| {
        match mounts
            .iter_mut()
            .find(|mount| &mount.container == container)
        {
            Some(mount) => mount.tree = tree,
            None => mounts.push(Mount {
                container: container.clone(),
                tree,
            }),
        }
    });
}

/// Forgets the app mounted into `container`.
///
/// # Errors
///
/// Fails if nothing is mounted there.
pub(crate) fn remove(container: &Element) -> Result<(), Error> {
    MOUNTS.with_borrow_mut(|mounts| {
        let index = mounts
            .iter()
            .position(|mount| &mount.container == container)
            .ok_or(Error::NotMounted)?;

        mounts.swap_remove(index);
        Ok(())
    })
}
