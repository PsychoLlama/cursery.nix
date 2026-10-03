//! WASM bindings for evaluating Nix.

mod error;
mod memfs;
mod store;

use std::{
    path::{Component, Path, PathBuf},
    rc::Rc,
};

use js_sys::{Array, Object};
use snix_eval::{EvalIO, EvalMode, Evaluation};
use wasm_bindgen::prelude::*;

use crate::{error::Error, memfs::Files};

/// Runs once when the module is instantiated.
#[wasm_bindgen(start)]
fn start() {
    // Report Rust panics through `console.error` with a message instead of an
    // opaque `unreachable` trap.
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
extern "C" {
    /// Nix sources keyed by path, e.g. from `import.meta.glob`.
    #[wasm_bindgen(typescript_type = "Record<string, string>")]
    pub type NixFiles;
}

/// Load Nix files into the store and return their path, e.g.
/// `/3f9a0c1e2b7d4a65`. Import from it during evaluation:
/// `import ${path}/main.nix`.
///
/// Paths are relative to the returned path (`main.nix` or `./main.nix`).
/// Identical files share a path. Nothing is evaluated.
///
/// # Errors
///
/// Throws if a path escapes the root or a value isn't a string.
#[wasm_bindgen]
pub fn load(files: &NixFiles) -> Result<String, JsError> {
    Ok(store::load(read_files(files)?))
}

/// Release a path returned by `load`. Its files stay available until every
/// load of them is released.
///
/// # Errors
///
/// Throws if the path isn't loaded.
#[wasm_bindgen]
pub fn unload(path: &str) -> Result<(), JsError> {
    Ok(store::unload(path)?)
}

/// Strictly evaluate a Nix expression and render the result as Nix source.
///
/// Evaluation is pure: impure builtins are unavailable. Loaded files are
/// importable by path, and bundled libraries through the search path as
/// `<web>`.
///
/// # Errors
///
/// Throws if the expression fails to parse or evaluate.
#[wasm_bindgen]
pub fn evaluate(code: &str) -> Result<String, JsError> {
    Ok(evaluate_strictly(code)?)
}

fn read_files(files: &NixFiles) -> Result<Files, Error> {
    let mut result = Files::new();
    for entry in Object::entries(files.unchecked_ref()) {
        let entry: Array = entry.unchecked_into();
        let (Some(path), Some(contents)) = (entry.get(0).as_string(), entry.get(1).as_string())
        else {
            return Err(Error::InvalidFiles);
        };

        result.insert(normalize_path(&path)?, Rc::from(contents.as_bytes()));
    }

    Ok(result)
}

/// Normalizes `./a/b.nix` and `a/b.nix` to `a/b.nix`.
fn normalize_path(path: &str) -> Result<PathBuf, Error> {
    let mut normalized = PathBuf::new();
    for component in Path::new(path).components() {
        match component {
            Component::CurDir => {}
            Component::Normal(part) => normalized.push(part),
            Component::RootDir | Component::ParentDir | Component::Prefix(_) => {
                return Err(Error::InvalidPath(path.to_owned()));
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(Error::InvalidPath(path.to_owned()));
    }

    Ok(normalized)
}

fn evaluate_strictly(code: &str) -> Result<String, Error> {
    // A snapshot: changes to the store don't affect evaluations in progress.
    let (filesystem, bundled_path) = store::snapshot();
    let filesystem: Box<dyn EvalIO> = Box::new(filesystem);
    let result = Evaluation::builder_pure()
        .io_handle(filesystem)
        .enable_import()
        // Only `public/` is exposed, keeping internal modules out of `<web/...>`.
        .nix_path(Some(format!("web={bundled_path}/public")))
        .mode(EvalMode::Strict)
        .build()
        // Without a location, snix falls back to `current_dir()`, which is
        // unsupported on wasm. There is no filesystem, so any root will do.
        .evaluate(code, Some(PathBuf::from("/tmp")));

    if let Some(error) = result.errors.into_iter().next() {
        return Err(Error::Eval(error));
    }

    let value = result.value.ok_or(Error::NoValue)?;
    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_bundled_libraries() -> Result<(), Error> {
        assert_eq!(
            evaluate_strictly("builtins.attrNames (import <web>)")?,
            r#"[ "dom" ]"#
        );
        Ok(())
    }
}
