//! WASM bindings for evaluating Nix.

mod error;
mod memfs;
mod session;
mod store;
mod store_path;
mod to_js;
mod virtual_dom;

use std::{
    path::{Component, Path, PathBuf},
    rc::Rc,
};

use js_sys::{Array, Object};
use smol_str::SmolStr;
use snix_eval::{EvalMode, Value};
use wasm_bindgen::prelude::*;
use web_sys::Element;

use crate::{
    error::Error,
    memfs::Files,
    session::{Session, Variables},
    to_js::to_js,
};

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

/// Load Nix files into the store and return their store path, e.g.
/// `/nix/store/sf59v5wn0wryk29kvx93y9vp2s45z0kh-source`, matching the path
/// Nix gives the same files. Import from it during evaluation:
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
    // Store paths are always ASCII.
    Ok(store::load(read_files(files)?).display().to_string())
}

/// Release a path returned by `load`. Its files stay available until every
/// load of them is released.
///
/// # Errors
///
/// Throws if the path isn't loaded.
#[wasm_bindgen]
pub fn unload(path: &str) -> Result<(), JsError> {
    Ok(store::unload(Path::new(path))?)
}

/// Strictly evaluate a Nix expression and convert the result to JS. Attrsets
/// become objects with a null prototype.
///
/// Evaluation is pure: impure builtins are unavailable. Loaded files are
/// importable by path, and bundled libraries through the search path as
/// `<web>`.
///
/// # Errors
///
/// Throws if the expression fails to parse or evaluate, or the result
/// contains something JS can't represent (functions, integers beyond 2^53).
#[wasm_bindgen(unchecked_return_type = "unknown")]
pub fn evaluate(code: &str) -> Result<JsValue, JsError> {
    Ok(to_js(&Session::new().evaluate(
        code,
        None,
        EvalMode::Strict,
    )?)?)
}

/// Render an app into `container`, replacing its contents. `path` is its
/// `default.nix`, or a directory containing one, e.g. `${path}/app` for a
/// path returned by `load`.
///
/// Apps are attrsets of optional hooks. `render` takes the state (for now,
/// always `{ }`) and returns children, like any element accepts:
///
/// ```nix
/// let inherit (import <web/dom>) html; in
/// {
///   render = state: html.h1 "Hello";
/// }
/// ```
///
/// # Errors
///
/// Throws if the app fails to evaluate or renders an invalid tree. The
/// container is left untouched.
#[wasm_bindgen]
pub fn mount(container: &Element, path: &str) -> Result<(), JsError> {
    let session = Session::new();

    // The app is evaluated once, leaving a view of it to call with state.
    let view = session.evaluate(
        "import renderer (import app)",
        Some(&Variables::from_iter([
            (
                SmolStr::new_static("renderer"),
                nix_path(session.bundled_path().join("internal/render.nix")),
            ),
            (SmolStr::new_static("app"), nix_path(PathBuf::from(path))),
        ])),
        EvalMode::Lazy,
    )?;

    let children = session.evaluate(
        "view { }",
        Some(&Variables::from_iter([(SmolStr::new_static("view"), view)])),
        EvalMode::Strict,
    )?;

    let document = container
        .owner_document()
        .ok_or_else(|| Error::Js("Container has no document".to_owned()))?;

    let nodes = virtual_dom::create_children(&children, &document)?;
    container.replace_children_with_node(&nodes);
    Ok(())
}

fn nix_path(path: PathBuf) -> Value {
    Value::Path(Box::new(path))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_bundled_libraries() -> Result<(), Error> {
        assert_eq!(
            Session::new()
                .evaluate("builtins.attrNames (import <web>)", None, EvalMode::Strict)?
                .to_string(),
            r#"[ "dom" ]"#
        );
        Ok(())
    }
}
