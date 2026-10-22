use std::path::PathBuf;

use js_sys::Object;
use wasm_bindgen::{JsCast, JsValue};

/// Errors surfaced to JS. Converted to a JS `Error` by `wasm-bindgen` at the
/// export boundary.
#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("{}", .0.fancy_format_str())]
    Eval(snix_eval::Error),

    #[error("Evaluation produced no value")]
    NoValue,

    #[error("Invalid file path {0:?}: must be relative to the chunk root")]
    InvalidPath(String),

    #[error("Invalid files: expected a map of paths to strings")]
    InvalidFiles,

    #[error("Not loaded: {0:?}")]
    NotLoaded(PathBuf),

    #[error("Nothing is mounted in the container")]
    NotMounted,

    #[error("Cannot convert a {0} to JS")]
    Unconvertible(&'static str),

    #[error("Cannot convert {0} to JS: integers beyond 2^53 lose precision")]
    UnsafeInteger(i64),

    #[error("Cannot convert to JS: invalid UTF-8")]
    InvalidUtf8,

    #[error("Invalid node: {0}")]
    InvalidNode(String),

    #[error("Invalid node: {0}")]
    InvalidNodeType(#[from] snix_eval::ErrorKind),

    #[error("{0}")]
    Js(String),
}

impl From<JsValue> for Error {
    /// Keeps the message of thrown errors (e.g. `InvalidCharacterError: ...`).
    fn from(error: JsValue) -> Self {
        let message = error
            .as_string()
            .unwrap_or_else(|| String::from(error.unchecked_ref::<Object>().to_string()));

        Self::Js(message)
    }
}
