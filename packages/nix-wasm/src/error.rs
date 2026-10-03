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
    NotLoaded(String),
}
