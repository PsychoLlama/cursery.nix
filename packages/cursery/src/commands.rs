//! `runCommand`: runs JavaScript, like nixpkgs' `runCommand` runs a
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

use js_sys::{Array, Function, JSON, Reflect};
use snix_eval::{NixAttrs, Value};
use wasm_bindgen::{JsCast, JsValue};

use crate::{effects::forced, error::Error, to_js::to_js};

/// Runs a `runCommand` effect: its `script` with `env` in scope, returning
/// `$out`. Errors name the command.
pub(crate) fn run(inputs: &NixAttrs) -> Result<Value, String> {
    let name = string(inputs, "name")?;
    run_script(inputs).map_err(|error| format!("Command {name:?} failed: {error}"))
}

fn run_script(inputs: &NixAttrs) -> Result<Value, String> {
    let script = string(inputs, "script")?;
    let env = inputs
        .select("env")
        .map(|env| forced(env).to_attrs())
        .transpose()
        .map_err(|error| error.to_string())?;

    let mut names = Vec::new();
    let arguments = Array::new();
    for (name, value) in env.iter().flat_map(NixAttrs::iter_sorted) {
        let name = String::from_utf8_lossy(name.as_bytes());
        if !is_identifier(&name) || name == "out" {
            return Err(format!(
                "Invalid env {name:?}: must be a JavaScript identifier, other than `out`"
            ));
        }

        names.push(format!("${name}"));
        arguments.push(&to_js(value).map_err(|error| format!("Invalid env {name:?}: {error}"))?);
    }

    let out = call(&names, &script, &arguments).map_err(|error| Error::from(error).to_string())?;
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

/// The string input `name`.
fn string(inputs: &NixAttrs, name: &str) -> Result<String, String> {
    let value = inputs
        .select(name)
        .map(forced)
        .ok_or_else(|| format!("Cannot runCommand without a `{name}`"))?;
    let string = value.to_str().map_err(|error| error.to_string())?;
    Ok(String::from_utf8_lossy(string.as_bytes()).into_owned())
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
