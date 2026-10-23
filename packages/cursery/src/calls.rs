//! Effects the host passes to `mount` by name, run with `io.call` from
//! `<web/io>`:
//!
//!   io.call "focus" "#input"
//!
//! An effect returning a promise outputs what it resolves to, once it
//! settles. The chain waits; the rest of the app doesn't.

use std::{collections::HashMap, rc::Rc};

use js_sys::{Function, JSON, Object, Promise, Reflect};
use snix_eval::{NixAttrs, Value};
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_futures::JsFuture;

use crate::{
    effects::{Output, forced},
    error::Error,
    to_js::to_js,
};

/// The `effects` passed to `mount`.
#[derive(Debug, Clone, Default)]
pub(crate) struct Calls(Rc<HashMap<String, Function>>);

impl Calls {
    /// Reads `effects` from `mount`'s options. Later changes to the object
    /// don't apply.
    pub(crate) fn new(options: &JsValue) -> Result<Self, Error> {
        if options.is_undefined() || options.is_null() {
            return Ok(Self::default());
        }

        if !options.is_object() {
            return Err(Error::InvalidOptions("expected an object".to_owned()));
        }

        let effects = Reflect::get(options, &"effects".into())?;
        if effects.is_undefined() {
            return Ok(Self::default());
        }

        if !effects.is_object() {
            return Err(Error::InvalidOptions(
                "expected `effects` to be an object of functions".to_owned(),
            ));
        }

        let mut calls = HashMap::new();
        for name in Object::keys(effects.unchecked_ref::<Object>()) {
            let effect = Reflect::get(&effects, &name)?;
            let name = name.as_string().unwrap_or_default();
            let Some(effect) = effect.dyn_ref::<Function>() else {
                return Err(Error::InvalidOptions(format!(
                    "expected effect {name:?} to be a function"
                )));
            };

            calls.insert(name, effect.clone());
        }

        Ok(Self(Rc::new(calls)))
    }

    /// Runs a `call` effect: the effect called `name`, with `input`,
    /// returning its output. Errors name the effect.
    pub(crate) fn run(&self, inputs: &NixAttrs) -> Result<Output, Error> {
        let name = inputs
            .select("name")
            .map(forced)
            .ok_or_else(|| Error::InvalidEffect("missing \"name\"".to_owned()))?;
        let name = name
            .to_str()
            .map_err(|error| Error::InvalidEffect(error.to_string()))?;
        let name = String::from_utf8_lossy(name.as_bytes()).into_owned();
        let Some(effect) = self.0.get(&name) else {
            return Err(Error::Effect(format!(
                "No effect {name:?}: pass it to `mount` in `effects`"
            )));
        };

        let failed = move |error| Error::Effect(format!("Effect {name:?} failed: {error}"));
        let output = match call(effect, inputs) {
            Ok(output) => output,
            Err(error) => return Err(failed(error)),
        };

        if !is_thenable(&output) {
            return from_js(&output).map(Output::Now).map_err(failed);
        }

        // Thenables are adopted, as `await` would.
        let promise = JsFuture::from(Promise::resolve(&output));
        Ok(Output::Later(Box::pin(async move {
            let output = promise
                .await
                .map_err(|error| Error::from(error).to_string());
            output.and_then(|output| from_js(&output)).map_err(failed)
        })))
    }
}

fn call(effect: &Function, inputs: &NixAttrs) -> Result<JsValue, String> {
    let input = inputs.select("input").map_or(Value::Null, forced);
    let input = to_js(&input).map_err(|error| format!("Invalid input: {error}"))?;
    effect
        .call1(&JsValue::UNDEFINED, &input)
        .map_err(|error| Error::from(error).to_string())
}

/// Converts an effect's output to Nix, as JSON would have it.
fn from_js(output: &JsValue) -> Result<Value, String> {
    // `JSON.stringify` returns `undefined` for `undefined`.
    let json = JSON::stringify(output)
        .map_err(|error| format!("Invalid output: {}", Error::from(error)))?
        .as_string()
        .unwrap_or_else(|| "null".to_owned());

    serde_json::from_str(&json).map_err(|error| format!("Invalid output: {error}"))
}

fn is_thenable(value: &JsValue) -> bool {
    value.is_object() && Reflect::get(value, &"then".into()).is_ok_and(|then| then.is_function())
}
