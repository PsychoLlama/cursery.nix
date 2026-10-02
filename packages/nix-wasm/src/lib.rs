//! WASM bindings for evaluating Nix.

mod error;

use std::path::PathBuf;

use snix_eval::{EvalMode, Evaluation};
use wasm_bindgen::prelude::*;

use crate::error::Error;

/// Where the bundled Nix library (`nix/`) is mounted, named after a hash of its
/// contents. Set by `build.rs`. Only `public/` is on the search path.
const BUNDLED_ROOT: &str = env!("BUNDLED_ROOT");

/// Runs once when the module is instantiated.
#[wasm_bindgen(start)]
fn start() {
    // Report Rust panics through `console.error` with a message instead of an
    // opaque `unreachable` trap.
    console_error_panic_hook::set_once();
}

/// Strictly evaluate a Nix expression and render the result as Nix source.
///
/// Evaluation is pure: imports and impure builtins are unavailable.
///
/// # Errors
///
/// Throws if the expression fails to parse or evaluate.
#[wasm_bindgen]
pub fn evaluate(code: &str) -> Result<String, JsError> {
    let result = Evaluation::builder_pure()
        .nix_path(Some(format!("web={BUNDLED_ROOT}/public")))
        .mode(EvalMode::Strict)
        .build()
        // Without a location, snix falls back to `current_dir()`, which is
        // unsupported on wasm. There is no filesystem, so any root will do.
        .evaluate(code, Some(PathBuf::from("/tmp")));

    if let Some(error) = result.errors.into_iter().next() {
        return Err(Error::Eval(error).into());
    }

    let value = result.value.ok_or(Error::NoValue)?;
    Ok(value.to_string())
}
