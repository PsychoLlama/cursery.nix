//! An in-memory filesystem backing `import` and `<...>` lookups.
//!
//! Files are grouped into chunks, each mounted at the store path Nix would give
//! the same files, e.g. `/nix/store/<hash>-source`. Directories are implied by
//! the files beneath them.

use std::{
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    io::{self, Cursor, Read},
    path::{Path, PathBuf},
    rc::Rc,
};

use include_dir::{Dir, DirEntry, include_dir};
use snix_eval::{EvalIO, FileType};

use crate::store_path::{store_dir, store_path};

/// The bundled Nix library.
///
/// On stable Rust, `include_dir!` can't track newly added files. `build.rs`
/// forces a recompile instead.
static BUNDLED_LIBRARY: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/nix");

/// File contents, keyed by path relative to the chunk root.
pub(crate) type Files = BTreeMap<PathBuf, Rc<[u8]>>;

/// Cheap to clone: chunks are shared, so a clone serves as a snapshot.
#[derive(Debug, Clone, Default)]
pub(crate) struct MemoryFilesystem {
    /// Keyed by store path, e.g.
    /// `/nix/store/sf59v5wn0wryk29kvx93y9vp2s45z0kh-source`.
    chunks: BTreeMap<PathBuf, Rc<Files>>,
}

impl MemoryFilesystem {
    /// Mounts `files` at their store path and returns it. Identical files
    /// always land at the same path.
    pub(crate) fn mount(&mut self, files: Files) -> PathBuf {
        let store_path = store_path(&files);
        self.chunks.insert(store_path.clone(), Rc::new(files));
        store_path
    }

    pub(crate) fn unmount(&mut self, store_path: &Path) {
        self.chunks.remove(store_path);
    }

    /// Splits `/nix/store/<hash>-<name>/rest` into the chunk and `rest`.
    fn locate<'a, 'b>(&'a self, path: &'b Path) -> Option<(&'a Files, &'b Path)> {
        let store_path = path
            .ancestors()
            .find(|ancestor| ancestor.parent() == Some(store_dir()))?;

        let files = self.chunks.get(store_path)?;
        Some((files, path.strip_prefix(store_path).ok()?))
    }

    fn file(&self, path: &Path) -> Option<&Rc<[u8]>> {
        let (files, relative) = self.locate(path)?;
        files.get(relative)
    }

    fn is_directory(&self, path: &Path) -> bool {
        self.locate(path).is_some_and(|(files, relative)| {
            files
                .keys()
                .any(|file| file != relative && file.starts_with(relative))
        })
    }
}

/// The bundled Nix library (`nix/`), ready to mount.
pub(crate) fn bundled_library() -> Files {
    let mut files = Files::new();
    collect_bundled_files(&BUNDLED_LIBRARY, &mut files);
    files
}

/// Flattens a bundled directory into `files`. Entry paths are relative to
/// `nix/`, even when nested.
fn collect_bundled_files(directory: &Dir<'static>, files: &mut Files) {
    for entry in directory.entries() {
        match entry {
            DirEntry::Dir(subdirectory) => collect_bundled_files(subdirectory, files),
            DirEntry::File(file) => {
                files.insert(file.path().to_owned(), Rc::from(file.contents()));
            }
        }
    }
}

fn not_found() -> io::Error {
    io::ErrorKind::NotFound.into()
}

impl EvalIO for MemoryFilesystem {
    fn path_exists(&self, path: &Path) -> io::Result<bool> {
        Ok(self.file(path).is_some() || self.is_directory(path))
    }

    fn open(&self, path: &Path) -> io::Result<Box<dyn Read>> {
        let contents = self.file(path).ok_or_else(not_found)?;
        Ok(Box::new(Cursor::new(Rc::clone(contents))))
    }

    fn file_type(&self, path: &Path) -> io::Result<FileType> {
        if self.file(path).is_some() {
            Ok(FileType::Regular)
        } else if self.is_directory(path) {
            Ok(FileType::Directory)
        } else {
            Err(not_found())
        }
    }

    fn read_dir(&self, path: &Path) -> io::Result<Vec<(bytes::Bytes, FileType)>> {
        let Some((files, directory)) = self.locate(path) else {
            return Err(not_found());
        };

        if !self.is_directory(path) {
            return Err(not_found());
        }

        let mut entries = BTreeMap::new();
        for file in files.keys() {
            let Ok(relative) = file.strip_prefix(directory) else {
                continue;
            };

            let mut components = relative.components();
            if let Some(name) = components.next() {
                let file_type = if components.next().is_some() {
                    FileType::Directory
                } else {
                    FileType::Regular
                };

                let name = name.as_os_str().as_encoded_bytes().to_vec();
                entries.insert(name, file_type);
            }
        }

        Ok(entries
            .into_iter()
            .map(|(name, file_type)| (bytes::Bytes::from(name), file_type))
            .collect())
    }

    fn import_path(&self, path: &Path) -> io::Result<PathBuf> {
        Ok(path.to_owned())
    }

    fn get_env(&self, _key: &OsStr) -> Option<OsString> {
        None
    }
}
