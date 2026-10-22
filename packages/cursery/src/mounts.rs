//! Apps mounted into containers, keyed by container.
//!
//! Mounting into an occupied container updates the app in place, e.g. after
//! a hot reload, patching the DOM rather than replacing it and keeping state.

use std::{cell::RefCell, rc::Rc};

use snix_eval::Value;
use web_sys::Element;

use crate::{error::Error, events::Listeners, session::Session};

thread_local! {
    /// wasm is single-threaded, so this is effectively a global.
    static MOUNTS: RefCell<Vec<(Element, Mount)>> = const { RefCell::new(Vec::new()) };
}

#[derive(Debug, Clone)]
pub(crate) struct Mount {
    /// Evaluates calls to the renderer: values only work in their session.
    pub(crate) session: Rc<Session>,

    /// What `internal/render.nix` returned for the app.
    pub(crate) renderer: Value,

    /// The children last rendered into the container.
    pub(crate) tree: Value,

    /// What the renderer kept for the next mount, e.g. state.
    pub(crate) kept: Value,

    /// Kept across mounts, and removed with the last of them.
    pub(crate) listeners: Rc<Listeners>,
}

/// The app mounted into `container`, if any.
pub(crate) fn get(container: &Element) -> Option<Mount> {
    MOUNTS.with_borrow(|mounts| {
        mounts
            .iter()
            .find(|(mounted, _)| mounted == container)
            .map(|(_, mount)| mount.clone())
    })
}

/// Records `mount` as the app mounted into `container`.
pub(crate) fn insert(container: &Element, mount: Mount) {
    MOUNTS.with_borrow_mut(|mounts| {
        match mounts.iter_mut().find(|(mounted, _)| mounted == container) {
            Some((_, existing)) => *existing = mount,
            None => mounts.push((container.clone(), mount)),
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
            .position(|(mounted, _)| mounted == container)
            .ok_or(Error::NotMounted)?;

        mounts.swap_remove(index);
        Ok(())
    })
}
