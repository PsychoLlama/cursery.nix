//! WASM bindings for evaluating Nix.

mod app;
mod commands;
mod effects;
mod error;
mod events;
mod memfs;
mod mounts;
mod server;
mod session;
mod store;
mod store_path;
mod to_js;
mod virtual_dom;

use std::{
    path::{Component, Path, PathBuf},
    rc::Rc,
};

use js_sys::{Array, JSON, Object};
use snix_eval::EvalMode;
use wasm_bindgen::prelude::*;
use web_sys::Element;

use crate::{error::Error, memfs::Files, session::Session, to_js::to_js};

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

    /// Inputs for a server render, as JSON would have them.
    #[wasm_bindgen(typescript_type = "Record<string, unknown>")]
    pub type ServerInputs;
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
        &[],
        EvalMode::Strict,
    )?)?)
}

/// Render an app into `container`. `path` is its `default.nix`, or a
/// directory containing one, e.g. `${path}/app` for a path returned by `load`.
///
/// Apps are attrsets of optional hooks. `render` takes the state and returns
/// children, like any element accepts. State starts as `init`, or `{ }`
/// without it, and `update` returns the next state given an action. `init`
/// and `update` come as a pair.
///
/// ```nix
/// let inherit (import <web/dom>) html; in
/// {
///   init = { name = "world"; };
///   update = state: action: state;
///   render = state: html.h1 "Hello, ${state.name}";
/// }
/// ```
///
/// Handlers in `on` (see `<web/dom>`) return effects, like `io.dispatch`
/// from `<web/io>`, which runs `update` and renders. `io.map`, `io.pipe`,
/// and `io.all` combine effects into one, e.g. to use the next state a
/// dispatch outputs. If a handler or `update` fails, the error is logged;
/// earlier dispatches stay rendered.
///
/// `styles` holds global rules by selector, as `css` from `<web/style>`
/// takes them, e.g. `styles.body.margin = 0;`. They're adopted by the
/// container's root while the app is mounted.
///
/// The first mount replaces the container's contents. Mounting again, e.g.
/// with a hot-reloaded `path`, updates the app in place: the DOM is patched
/// to match the new render, and state carries over, ignoring the new `init`.
///
/// # Errors
///
/// Throws if the app is invalid, fails to evaluate, or renders an invalid
/// tree. The container and state are left untouched.
#[wasm_bindgen]
pub fn mount(container: &Element, path: &str) -> Result<(), JsError> {
    Ok(app::mount(container, path)?)
}

/// Remove the app mounted into `container`, clearing its contents.
///
/// # Errors
///
/// Throws if nothing is mounted there.
#[wasm_bindgen]
pub fn unmount(container: &Element) -> Result<(), JsError> {
    mounts::remove(container)?;
    container.replace_children_with_node_0();
    Ok(())
}

/// Render a page to HTML, e.g. on a server. `path` is its entrypoint: a
/// `default.nix`, or a directory containing one, from a path returned by
/// `load`.
///
/// The entrypoint is a function of `inputs`, data like bundle URLs from the
/// build, as JSON would have them. It returns the whole page, as an `html`
/// element, rendering apps into it with `render` from `<web/server>`. The
/// page is prefixed with `<!doctype html>`, and nothing else:
///
/// ```nix
/// { bundles, ... }:
/// let inherit (import <web/dom>) html; in
/// html.html { lang = "en"; } [
///   (html.head (map (src: html.script { type = "module"; inherit src; }) bundles))
///   (html.body (html.h1 "Hello"))
/// ]
/// ```
///
/// Handlers are dropped. Scripts can't have children, since their text
/// would run, and styles can't contain `</style`.
///
/// # Errors
///
/// Throws if `inputs` isn't JSON data, or the page fails to evaluate or
/// isn't a valid `html` element.
#[wasm_bindgen(js_name = renderToString)]
pub fn render_to_string(path: &str, inputs: Option<ServerInputs>) -> Result<String, JsError> {
    let inputs = match inputs {
        None => "{}".to_owned(),
        Some(inputs) => JSON::stringify(&inputs)
            .map_err(Error::from)?
            .as_string()
            .ok_or(Error::InvalidInputs)?,
    };

    Ok(server::render(path, &inputs)?)
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
                .evaluate("builtins.attrNames (import <web>)", &[], EvalMode::Strict)?
                .to_string(),
            r#"[ "dom" "io" "server" "style" ]"#
        );
        Ok(())
    }
}
