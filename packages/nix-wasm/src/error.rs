/// Errors surfaced to JS. Converted to a JS `Error` by `wasm-bindgen` at the
/// export boundary.
#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("{}", .0.fancy_format_str())]
    Eval(snix_eval::Error),

    #[error("Evaluation produced no value")]
    NoValue,
}
