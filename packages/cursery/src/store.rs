//! Chunks of Nix files shared by every evaluation.
//!
//! Loading a chunk mounts it at its store path and returns that path. Loads are
//! reference counted: identical chunks share a path, so unloading one copy
//! (e.g. an HMR module being replaced by an unchanged one) mustn't remove it
//! out from under the others.

use std::{
    cell::RefCell,
    collections::BTreeMap,
    path::{Path, PathBuf},
};

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

    /// Store path of the bundled library. It isn't reference counted, so it
    /// can't be unloaded.
    bundled_path: PathBuf,

    /// How many loads hold each chunk.
    references: BTreeMap<PathBuf, usize>,
}

impl Store {
    fn new() -> Self {
        let mut filesystem = MemoryFilesystem::default();
        let bundled_path = filesystem.mount(memfs::bundled_library());

        Self {
            filesystem,
            bundled_path,
            references: BTreeMap::new(),
        }
    }
}

/// Mounts `files` and returns their store path, e.g.
/// `/nix/store/sf59v5wn0wryk29kvx93y9vp2s45z0kh-source`.
pub(crate) fn load(files: Files) -> PathBuf {
    STORE.with_borrow_mut(|store| {
        let store_path = store.filesystem.mount(files);
        *store.references.entry(store_path.clone()).or_default() += 1;
        store_path
    })
}

/// Releases a path returned by [`load`]. The chunk is unmounted once every
/// load holding it is released.
///
/// # Errors
///
/// Fails if `path` isn't loaded.
pub(crate) fn unload(store_path: &Path) -> Result<(), Error> {
    STORE.with_borrow_mut(|store| {
        let count = store
            .references
            .get_mut(store_path)
            .ok_or_else(|| Error::NotLoaded(store_path.to_owned()))?;

        *count -= 1;
        if *count == 0 {
            store.references.remove(store_path);

            // Loading a copy of the bundled library shares its mount.
            if store_path != store.bundled_path {
                store.filesystem.unmount(store_path);
            }
        }

        Ok(())
    })
}

/// The current filesystem, unaffected by later loads and unloads, along with
/// the path of the bundled library.
pub(crate) fn snapshot() -> (MemoryFilesystem, PathBuf) {
    STORE.with_borrow(|store| (store.filesystem.clone(), store.bundled_path.clone()))
}
