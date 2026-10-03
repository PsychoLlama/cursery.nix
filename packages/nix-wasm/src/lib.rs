//! WASM bindings for evaluating Nix.

mod error;
mod memfs;

use std::{cell::RefCell, path::PathBuf};

use snix_eval::{EvalIO, EvalMode, Evaluation};
use wasm_bindgen::prelude::*;

use crate::{
    error::Error,
    memfs::{BUNDLED_HASH, MemoryFilesystem},
};

thread_local! {
    /// Files available to `import`, kept across evaluations. wasm is
    /// single-threaded, so this is effectively a global.
    static FILESYSTEM: RefCell<MemoryFilesystem> =
        RefCell::new(MemoryFilesystem::with_bundled_library());
}

/// Runs once when the module is instantiated.
#[wasm_bindgen(start)]
fn start() {
    // Report Rust panics through `console.error` with a message instead of an
    // opaque `unreachable` trap.
    console_error_panic_hook::set_once();
}

/// Strictly evaluate a Nix expression and render the result as Nix source.
///
/// Evaluation is pure: impure builtins are unavailable. Bundled libraries are
/// importable through the search path as `<web>`.
///
/// # Errors
///
/// Throws if the expression fails to parse or evaluate.
#[wasm_bindgen]
pub fn evaluate(code: &str) -> Result<String, JsError> {
    Ok(evaluate_strictly(code)?)
}

fn evaluate_strictly(code: &str) -> Result<String, Error> {
    // A snapshot: changes to the filesystem don't affect evaluations in
    // progress.
    let filesystem: Box<dyn EvalIO> = Box::new(FILESYSTEM.with_borrow(Clone::clone));
    let result = Evaluation::builder_pure()
        .io_handle(filesystem)
        .enable_import()
        // Only `public/` is exposed, keeping internal modules out of `<web/...>`.
        .nix_path(Some(format!("web=/{BUNDLED_HASH}/public")))
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
