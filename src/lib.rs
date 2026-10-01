//! WASM bindings for evaluating Nix.

use std::path::PathBuf;

use snix_eval::{EvalMode, Evaluation};
use wasm_bindgen::prelude::*;

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
        .mode(EvalMode::Strict)
        .build()
        // Without a location, snix falls back to `current_dir()`, which is
        // unsupported on wasm. There is no filesystem, so any root will do.
        .evaluate(code, Some(PathBuf::from("/tmp")));

    if let Some(error) = result.errors.first() {
        return Err(JsError::new(&error.fancy_format_str()));
    }

    result
        .value
        .map(|value| value.to_string())
        .ok_or_else(|| JsError::new("Evaluation produced no value"))
}
