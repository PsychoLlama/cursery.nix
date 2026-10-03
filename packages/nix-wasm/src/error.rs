use std::path::PathBuf;

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

    #[error("Cannot convert a {0} to JS")]
    Unconvertible(&'static str),

    #[error("Cannot convert {0} to JS: integers beyond 2^53 lose precision")]
    UnsafeInteger(i64),

    #[error("Cannot convert to JS: invalid UTF-8")]
    InvalidUtf8,

    #[error("{0}")]
    Js(String),
}
