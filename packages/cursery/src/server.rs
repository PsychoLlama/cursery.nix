//! Server renders: pages from a Nix entrypoint, as HTML.

use std::path::PathBuf;

use snix_eval::{EvalMode, Value};

use crate::{error::Error, session::Session, virtual_dom::serialize};

/// See the `renderToString` export. `inputs` is JSON.
pub(crate) fn render(path: &str, inputs: &str) -> Result<String, Error> {
    let session = Session::new();
    let page = session.evaluate(
        "import server (builtins.fromJSON inputs)",
        &[
            ("server", Value::Path(Box::new(PathBuf::from(path)))),
            ("inputs", Value::from(inputs)),
        ],
        EvalMode::Strict,
    )?;

    serialize::page(&page)
}
