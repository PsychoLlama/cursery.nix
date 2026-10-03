//! Derives where the bundled Nix library (`nix/`) is mounted.
//!
//! Sets the `BUNDLED_HASH` env var for the crate: a hash of the library's
//! contents, which names its mount point. It changes whenever the library
//! does, so it can't be usefully hardcoded. Consumers go through the search
//! path (`<web/...>`) instead.

use std::{
    env, fs,
    hash::{DefaultHasher, Hash, Hasher},
    io,
    path::{Path, PathBuf},
};

fn main() -> io::Result<()> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("nix");
    println!("cargo::rerun-if-changed={}", root.display());

    let mut files = Vec::new();
    find_files(&root, &mut files)?;
    files.sort();

    // Not stable across Rust releases, but it only has to be consistent within
    // a single build.
    let mut hasher = DefaultHasher::new();
    for path in &files {
        let relative = into_utf8(path.strip_prefix(&root).map_err(io::Error::other)?)?;
        relative.hash(&mut hasher);
        fs::read(path)?.hash(&mut hasher);
    }

    println!("cargo::rustc-env=BUNDLED_HASH={:016x}", hasher.finish());
    Ok(())
}

fn find_files(dir: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            find_files(&path, files)?;
        } else {
            files.push(path);
        }
    }

    Ok(())
}

fn into_utf8(path: &Path) -> io::Result<&str> {
    path.to_str()
        .ok_or_else(|| io::Error::other(format!("non-UTF-8 path: {}", path.display())))
}
