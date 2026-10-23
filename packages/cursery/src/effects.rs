//! Effects that handlers return, run by Rust between evaluations (see `run`
//! in `app.rs`). `internal/io/effects.nix` describes them as
//! `{ _type = "effect"; kind; inputs; }`, deep-forced, so running one reads
//! plain data.

use snix_eval::{NixAttrs, Value};

use crate::{error::Error, mounts::Mount};

/// Runs `effect`, returning its output.
pub(crate) fn run(mount: &Mount, effect: &Value) -> Result<Value, Error> {
    let effect = attrs(effect)?;
    let kind = forced(field(&effect, "kind")?);
    let kind = kind
        .to_str()
        .map_err(|error| Error::InvalidEffect(error.to_string()))?;
    let kind = String::from_utf8_lossy(kind.as_bytes());
    let inputs = attrs(field(&effect, "inputs")?)?;

    match kind.as_ref() {
        "preventDefault" => mount
            .session
            .dispatching()
            .find(&kind, &inputs)
            .map(|event| {
                event.prevent_default();
                Value::Null
            }),
        kind => Err(format!("Unknown effect {kind:?}")),
    }
    .map_err(Error::Effect)
}

/// Sees through thunks, which forcing the effect has already forced.
pub(crate) fn forced(value: &Value) -> Value {
    match value {
        Value::Thunk(thunk) if thunk.is_evaluated() => forced(&thunk.value()),
        value => value.clone(),
    }
}

fn attrs(value: &Value) -> Result<NixAttrs, Error> {
    forced(value)
        .to_attrs()
        .map_err(|error| Error::InvalidEffect(error.to_string()))
}

fn field<'a>(attrs: &'a NixAttrs, name: &str) -> Result<&'a Value, Error> {
    attrs
        .select(name)
        .ok_or_else(|| Error::InvalidEffect(format!("missing {name:?}")))
}
