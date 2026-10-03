//! Chunks of Nix files shared by every evaluation.
//!
//! Loading a chunk mounts it at `/<hash>` and returns that path. Loads are
//! reference counted: identical chunks share a path, so unloading one copy
//! (e.g. an HMR module being replaced by an unchanged one) mustn't remove it
//! out from under the others.

use std::{cell::RefCell, collections::BTreeMap};

use crate::{
    error::Error,
    memfs::{self, Files, MemoryFilesystem},
};

thread_local! {
    /// wasm is single-threaded, so this is effectively a global.
    static STORE: RefCell<Store> = RefCell::new(Store::new());
}

#[derive(Debug)]
struct Store {
    filesystem: MemoryFilesystem,

    /// Hash of the bundled library. It isn't reference counted, so it can't
    /// be unloaded.
    bundled_hash: String,

    /// How many loads hold each chunk.
    references: BTreeMap<String, usize>,
}

impl Store {
    fn new() -> Self {
        let mut filesystem = MemoryFilesystem::default();
        let bundled_hash = filesystem.mount(memfs::bundled_library());

        Self {
            filesystem,
            bundled_hash,
            references: BTreeMap::new(),
        }
    }
}

/// Mounts `files` and returns their path, e.g. `/3f9a0c1e2b7d4a65`.
pub(crate) fn load(files: Files) -> String {
    STORE.with_borrow_mut(|store| {
        let hash = store.filesystem.mount(files);
        *store.references.entry(hash.clone()).or_default() += 1;
        format!("/{hash}")
    })
}

/// Releases a path returned by [`load`]. The chunk is unmounted once every
/// load holding it is released.
///
/// # Errors
///
/// Fails if `path` isn't loaded.
pub(crate) fn unload(path: &str) -> Result<(), Error> {
    STORE.with_borrow_mut(|store| {
        let not_loaded = || Error::NotLoaded(path.to_owned());
        let hash = path.strip_prefix('/').ok_or_else(not_loaded)?;
        let count = store.references.get_mut(hash).ok_or_else(not_loaded)?;

        *count -= 1;
        if *count == 0 {
            store.references.remove(hash);

            // Loading a copy of the bundled library shares its mount.
            if hash != store.bundled_hash {
                store.filesystem.unmount(hash);
            }
        }

        Ok(())
    })
}

/// The current filesystem, unaffected by later loads and unloads, along with
/// the path of the bundled library.
pub(crate) fn snapshot() -> (MemoryFilesystem, String) {
    STORE.with_borrow(|store| (store.filesystem.clone(), format!("/{}", store.bundled_hash)))
}
