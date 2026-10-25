use std::path::PathBuf;

use js_sys::Object;
use snix_eval::{CatchableErrorKind, ErrorKind};
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

    #[error("Invalid renderer result: {0}")]
    InvalidRenderer(String),

    #[error("Invalid effect step: {0}")]
    InvalidStep(String),

    #[error("Invalid effect: {0}")]
    InvalidEffect(String),

    #[error("Invalid mount options: {0}")]
    InvalidOptions(String),

    /// An effect failed, e.g. a call threw.
    #[error("{0}")]
    Effect(String),

    #[error("Cannot convert a {0} to JS")]
    Unconvertible(&'static str),

    #[error("Cannot convert {0} to JS: integers beyond 2^53 lose precision")]
    UnsafeInteger(i64),

    #[error("Cannot convert to JS: invalid UTF-8")]
    InvalidUtf8,

    #[error("Invalid node: {0}")]
    InvalidNode(String),

    #[error("Invalid node: {0}")]
    InvalidNodeType(#[from] ErrorKind),

    #[error("Invalid page: {0}")]
    InvalidPage(String),

    #[error("Invalid inputs: expected JSON data")]
    InvalidInputs,

    #[error("Invalid payload: expected JSON data")]
    InvalidPayload,

    #[error("Cannot dispatch while the app is rendering")]
    Rendering,

    #[error("Invalid CSS for class {0:?}: {1}")]
    InvalidStyle(String, Box<Error>),

    #[error("Invalid CSS for class {0:?}: it can't close the class's rule")]
    UnscopedStyle(String),

    #[error("Invalid global styles: {0}")]
    InvalidGlobalStyle(Box<Error>),

    #[error("Different styles hash to the same class name {0:?}")]
    StyleCollision(String),

    #[error("{0}")]
    Js(String),
}

impl Error {
    /// The message alone, without the source excerpt, e.g. for `io.catch`.
    /// Messages from `throw` are as thrown.
    pub(crate) fn message(&self) -> String {
        match self {
            Self::Eval(error) => match &error.kind {
                ErrorKind::CatchableError(CatchableErrorKind::Throw(message)) => {
                    String::from_utf8_lossy(message.as_bytes()).into_owned()
                }
                kind => kind.to_string(),
            },
            error => error.to_string(),
        }
    }
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
