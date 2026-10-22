//! Nix store paths for chunks, matching what Nix computes for the same files
//! (e.g. `builtins.path { path = ./.; name = "source"; }`).
//!
//! A store path hashes a fingerprint, which in turn includes the SHA-256 of
//! the files serialized as a Nix archive (NAR).

use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

use crate::memfs::Files;

/// Where store paths live.
pub(crate) fn store_dir() -> &'static Path {
    Path::new("/nix/store")
}

/// The store path for `files`, e.g.
/// `/nix/store/sf59v5wn0wryk29kvx93y9vp2s45z0kh-source`.
pub(crate) fn store_path(files: &Files) -> PathBuf {
    const NAME: &str = "source";

    let mut nar = Sha256::new();
    write_nar(&mut nar, files);

    // Fixed-output, recursive (NAR), SHA-256 paths are fingerprinted as
    // `source` regardless of the name.
    let fingerprint = format!(
        "source:sha256:{:x}:{}:{NAME}",
        nar.finalize(),
        store_dir().display()
    );
    fingerprinted(&fingerprint, NAME)
}

/// The store path for an output named `name` of a derivation whose SHA-256
/// is `hash` (in hex), e.g. `/nix/store/<hash>-<name>`.
pub(crate) fn output_path(hash: &str, name: &str) -> PathBuf {
    let fingerprint = format!("output:out:sha256:{hash}:{}:{name}", store_dir().display());

    fingerprinted(&fingerprint, name)
}

fn fingerprinted(fingerprint: &str, name: &str) -> PathBuf {
    let digest = Sha256::digest(fingerprint);

    // Folded down to 160 bits.
    let mut compressed = [0; 20];
    for (index, byte) in digest.iter().enumerate() {
        compressed[index % compressed.len()] ^= byte;
    }

    store_dir().join(format!("{}-{name}", nixbase32(&compressed)))
}

/// Serializes `files` as a directory NAR.
///
/// Paths are sorted component-wise, which is the order NAR requires for
/// directory entries, and a directory's files are contiguous. That lets this
/// stream through `files`, tracking which directories are open.
fn write_nar(nar: &mut Sha256, files: &Files) {
    write_strings(nar, &[b"nix-archive-1", b"(", b"type", b"directory"]);

    let mut open: Vec<&OsStr> = Vec::new();
    for (path, contents) in files {
        let directories: Vec<&OsStr> = path.parent().into_iter().flat_map(|p| p.iter()).collect();
        let shared = open
            .iter()
            .zip(&directories)
            .take_while(|(open, directory)| open == directory)
            .count();

        for _ in shared..open.len() {
            write_strings(nar, &[b")", b")"]);
        }

        open.truncate(shared);
        for directory in &directories[shared..] {
            write_entry(nar, directory);
            write_strings(nar, &[b"directory"]);
            open.push(directory);
        }

        if let Some(name) = path.file_name() {
            write_entry(nar, name);
            write_strings(nar, &[b"regular", b"contents", contents, b")", b")"]);
        }
    }

    for _ in &open {
        write_strings(nar, &[b")", b")"]);
    }

    write_strings(nar, &[b")"]);
}

/// Opens a directory entry, up to the node's type.
fn write_entry(nar: &mut Sha256, name: &OsStr) {
    let name = name.as_encoded_bytes();
    write_strings(
        nar,
        &[b"entry", b"(", b"name", name, b"node", b"(", b"type"],
    );
}

/// Strings are length-prefixed (64-bit little-endian) and zero-padded to a
/// multiple of 8 bytes.
fn write_strings(nar: &mut Sha256, strings: &[&[u8]]) {
    for string in strings {
        let length = string.len() as u64;
        nar.update(length.to_le_bytes());
        nar.update(string);
        nar.update(&[0; 8][..string.len().wrapping_neg() % 8]);
    }
}

/// Nix's base-32 encoding: a custom alphabet, read from the last byte first.
fn nixbase32(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 32] = b"0123456789abcdfghijklmnpqrsvwxyz";

    let length = (bytes.len() * 8).div_ceil(5);
    (0..length)
        .rev()
        .map(|position| {
            let bit = position * 5;
            let (index, offset) = (bit / 8, bit % 8);
            let low = u16::from(bytes[index]) >> offset;
            let high = bytes
                .get(index + 1)
                .map_or(0, |&byte| u16::from(byte) << (8 - offset));

            char::from(ALPHABET[usize::from((low | high) & 0x1f)])
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, rc::Rc};

    use super::*;

    fn files(entries: &[(&str, &str)]) -> Files {
        entries
            .iter()
            .map(|(path, contents)| (PathBuf::from(path), Rc::from(contents.as_bytes())))
            .collect()
    }

    // Expected paths come from `builtins.path { path = ...; name = "source"; }`
    // over the same files.

    #[test]
    fn matches_nix_for_nested_directories() {
        let files = files(&[
            ("main.nix", "1"),
            ("a.nix", "x"),
            ("a/b.nix", "nested"),
            ("views/default.nix", "12345678"),
            ("views/deep/empty.nix", ""),
        ]);

        assert_eq!(
            store_path(&files),
            Path::new("/nix/store/sf59v5wn0wryk29kvx93y9vp2s45z0kh-source")
        );
    }

    #[test]
    fn matches_nix_for_empty_directories() {
        assert_eq!(
            store_path(&Files::new()),
            Path::new("/nix/store/0ccnxa25whszw7mgbgyzdm4nqc0zwnm8-source")
        );
    }
}
