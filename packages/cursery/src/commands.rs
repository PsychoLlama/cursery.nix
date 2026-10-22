//! `builtin:runCommand`: runs JavaScript, like nixpkgs' `runCommand` runs a
//! shell script. See `io.runCommand` in `<web/io>`.
//!
//! The script assigns its result to `$out`, and each attr of `env` is in
//! scope as `$<name>`:
//!
//!   io.runCommand "double" { count = 3; } ''
//!     $out = $count * 2;
//!   ''
//!
//! Scripts run synchronously: evaluation can't wait for a promise.

use std::{iter, rc::Rc};

use js_sys::{Array, Function, JSON, Reflect};
use snix_eval::{
    Value,
    generators::{self, GenCo},
};
use wasm_bindgen::{JsCast, JsValue};

use crate::{
    derivations::{Builder, Inputs},
    error::Error,
    events::Dispatching,
    to_js::to_js,
};

/// Builders running JavaScript: `builtin:runCommand`.
pub(crate) fn builders(dispatching: &Rc<Dispatching>) -> impl Iterator<Item = (String, Builder)> {
    let dispatching = Rc::clone(dispatching);
    let builder: Builder = Rc::new(move |co, inputs, passthru| {
        let dispatching = Rc::clone(&dispatching);
        Box::pin(async move { run(co, &dispatching, inputs, passthru).await })
    });

    iter::once(("builtin:runCommand".to_owned(), builder))
}

/// Runs the `script` input with `passthru.env` in scope, returning `$out`.
async fn run(
    co: &GenCo,
    dispatching: &Dispatching,
    inputs: Inputs,
    passthru: Value,
) -> Result<Value, String> {
    // Side effects belong to events, not renders.
    if dispatching.handling().is_none() {
        return Err("Cannot runCommand outside an event handler".to_owned());
    }

    let script = inputs
        .get("script")
        .ok_or("Cannot runCommand without a `script`")?;

    let passthru = generators::request_deep_force(co, passthru).await;
    if passthru.is_catchable() {
        return Ok(passthru);
    }

    let env = match &passthru {
        Value::Null => None,
        passthru => passthru
            .to_attrs()
            .map_err(|error| error.to_string())?
            .select("env")
            .cloned(),
    };

    let mut names = Vec::new();
    let arguments = Array::new();
    if let Some(env) = env {
        for (name, value) in env
            .to_attrs()
            .map_err(|error| error.to_string())?
            .iter_sorted()
        {
            let name = String::from_utf8_lossy(name.as_bytes());
            if !is_identifier(&name) || name == "out" {
                return Err(format!(
                    "Invalid env {name:?}: must be a JavaScript identifier, other than `out`"
                ));
            }

            names.push(format!("${name}"));
            arguments
                .push(&to_js(value).map_err(|error| format!("Invalid env {name:?}: {error}"))?);
        }
    }

    let out = call(&names, script, &arguments).map_err(|error| Error::from(error).to_string())?;
    if is_thenable(&out) {
        return Err(
            "Invalid `$out`: scripts run synchronously, so `$out` can't be a promise".to_owned(),
        );
    }

    // `JSON.stringify` returns `undefined` for `undefined`.
    let json = JSON::stringify(&out)
        .map_err(|error| format!("Invalid `$out`: {}", Error::from(error)))?
        .as_string()
        .unwrap_or_else(|| "null".to_owned());

    serde_json::from_str(&json).map_err(|error| format!("Invalid `$out`: {error}"))
}

/// Calls `script` as a function of `names`, returning `$out`. Compiling it
/// through the `Function` constructor, rather than `Function::new_with_args`,
/// catches syntax errors.
fn call(names: &[String], script: &str, arguments: &Array) -> Result<JsValue, JsValue> {
    let constructor: Function =
        Reflect::get(&js_sys::global(), &"Function".into())?.unchecked_into();
    let parameters: Array = names.iter().map(|name| JsValue::from_str(name)).collect();
    parameters.push(&format!("let $out = null;\n{script}\n;return $out;").into());

    let function: Function = Reflect::construct(&constructor, &parameters)?.unchecked_into();
    function.apply(&JsValue::UNDEFINED, arguments)
}

fn is_thenable(value: &JsValue) -> bool {
    value.is_object() && Reflect::get(value, &"then".into()).is_ok_and(|then| then.is_function())
}

/// Simple JavaScript identifiers, which `$` makes valid parameter names.
/// Reserved words can't follow `$`, so they're fine too.
fn is_identifier(name: &str) -> bool {
    name.chars()
        .all(|char| char.is_ascii_alphanumeric() || char == '_' || char == '$')
}
