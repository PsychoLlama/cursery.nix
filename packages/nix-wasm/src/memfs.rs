//! An in-memory filesystem backing `import` and `<...>` lookups.
//!
//! Holds the bundled Nix library under [`BUNDLED_ROOT`]. Directories are
//! implied by the files beneath them.

use std::{
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    io::{self, Cursor, Read},
    path::{Path, PathBuf},
    rc::Rc,
};

use include_dir::{Dir, DirEntry, include_dir};
use snix_eval::{EvalIO, FileType};

/// Where the bundled Nix library (`nix/`) is mounted, named after a hash of its
/// contents. Set by `build.rs`.
pub(crate) const BUNDLED_ROOT: &str = env!("BUNDLED_ROOT");

/// The bundled Nix library, mounted at [`BUNDLED_ROOT`].
///
/// On stable Rust, `include_dir!` can't track newly added files. Adding one
/// still changes `BUNDLED_ROOT`, which forces a recompile.
static BUNDLED_LIBRARY: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/nix");

#[derive(Debug)]
pub(crate) struct MemoryFilesystem {
    files: BTreeMap<PathBuf, Rc<[u8]>>,
}

impl MemoryFilesystem {
    /// A filesystem containing only the bundled Nix library.
    pub(crate) fn with_bundled_library() -> Self {
        let mut files = BTreeMap::new();
        mount_bundled_files(&BUNDLED_LIBRARY, &mut files);
        Self { files }
    }

    fn is_directory(&self, path: &Path) -> bool {
        self.files
            .keys()
            .any(|file| file != path && file.starts_with(path))
    }
}

/// Flattens a bundled directory into `files`. Entry paths are relative to
/// `nix/`, even when nested.
fn mount_bundled_files(directory: &Dir<'static>, files: &mut BTreeMap<PathBuf, Rc<[u8]>>) {
    for entry in directory.entries() {
        match entry {
            DirEntry::Dir(subdirectory) => mount_bundled_files(subdirectory, files),
            DirEntry::File(file) => {
                files.insert(
                    Path::new(BUNDLED_ROOT).join(file.path()),
                    Rc::from(file.contents()),
                );
            }
        }
    }
}

fn not_found() -> io::Error {
    io::ErrorKind::NotFound.into()
}

impl EvalIO for MemoryFilesystem {
    fn path_exists(&self, path: &Path) -> io::Result<bool> {
        Ok(self.files.contains_key(path) || self.is_directory(path))
    }

    fn open(&self, path: &Path) -> io::Result<Box<dyn Read>> {
        let contents = self.files.get(path).ok_or_else(not_found)?;
        Ok(Box::new(Cursor::new(Rc::clone(contents))))
    }

    fn file_type(&self, path: &Path) -> io::Result<FileType> {
        if self.files.contains_key(path) {
            Ok(FileType::Regular)
        } else if self.is_directory(path) {
            Ok(FileType::Directory)
        } else {
            Err(not_found())
        }
    }

    fn read_dir(&self, path: &Path) -> io::Result<Vec<(bytes::Bytes, FileType)>> {
        if !self.is_directory(path) {
            return Err(not_found());
        }

        let mut entries = BTreeMap::new();
        for file in self.files.keys() {
            let Ok(relative) = file.strip_prefix(path) else {
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
