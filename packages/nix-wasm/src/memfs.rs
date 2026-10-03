//! An in-memory filesystem backing `import` and `<...>` lookups.
//!
//! Files are grouped into chunks, each mounted at `/<hash>`. Directories are
//! implied by the files beneath them.

use std::{
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    io::{self, Cursor, Read},
    path::{Component, Path, PathBuf},
    rc::Rc,
};

use include_dir::{Dir, DirEntry, include_dir};
use snix_eval::{EvalIO, FileType};

/// A hash of the bundled Nix library (`nix/`), which is mounted at
/// `/<hash>`. Set by `build.rs`.
pub(crate) const BUNDLED_HASH: &str = env!("BUNDLED_HASH");

/// The bundled Nix library, mounted at `/<BUNDLED_HASH>`.
///
/// On stable Rust, `include_dir!` can't track newly added files. Adding one
/// still changes `BUNDLED_HASH`, which forces a recompile.
static BUNDLED_LIBRARY: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/nix");

/// File contents, keyed by path relative to the chunk root.
pub(crate) type Files = BTreeMap<PathBuf, Rc<[u8]>>;

/// Cheap to clone: chunks are shared, so a clone serves as a snapshot.
#[derive(Debug, Clone, Default)]
pub(crate) struct MemoryFilesystem {
    /// Keyed by hash, e.g. `3f9a0c1e2b7d4a65`.
    chunks: BTreeMap<OsString, Rc<Files>>,
}

impl MemoryFilesystem {
    /// A filesystem containing only the bundled Nix library.
    pub(crate) fn with_bundled_library() -> Self {
        let mut files = Files::new();
        collect_bundled_files(&BUNDLED_LIBRARY, &mut files);

        let mut filesystem = Self::default();
        filesystem.mount(BUNDLED_HASH.into(), files);
        filesystem
    }

    /// Mounts `files` at `/<hash>`, replacing any chunk already there.
    pub(crate) fn mount(&mut self, hash: OsString, files: Files) {
        self.chunks.insert(hash, Rc::new(files));
    }

    /// Splits `/<hash>/rest` into the chunk and `rest`.
    fn locate<'a, 'b>(&'a self, path: &'b Path) -> Option<(&'a Files, &'b Path)> {
        let mut components = path.components();
        let (Some(Component::RootDir), Some(Component::Normal(hash))) =
            (components.next(), components.next())
        else {
            return None;
        };

        let files = self.chunks.get(hash)?;
        Some((files, components.as_path()))
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
