//! Converts evaluated Nix values to JS.
//!
//! | Nix                | JS                          |
//! | ------------------ | --------------------------- |
//! | null, bool, float  | the same                    |
//! | int                | number, if exactly representable |
//! | string, path       | string                      |
//! | list               | array                       |
//! | attrs              | object with a null prototype |
//!
//! Functions aren't supported yet.

use std::{collections::HashMap, ptr};

use js_sys::{Array, Object, Reflect};
use snix_eval::{NixAttrs, NixList, Value};
use wasm_bindgen::{JsCast, JsValue};

use crate::error::Error;

/// Largest integer a JS number holds exactly (`Number.MAX_SAFE_INTEGER`).
const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;

pub(crate) fn to_js(value: &Value) -> Result<JsValue, Error> {
    Converter::default().convert(value)
}

/// Converts a value, remembering every container it converts.
///
/// Nix values are shared, and can be cyclic (`let x = { self = x; }; in x`).
/// Converting each container once, before its children, keeps sharing intact
/// on the JS side and stops cycles from recursing forever.
#[derive(Debug, Default)]
struct Converter {
    /// Keyed by container identity: see [`identity`].
    converted: HashMap<*const Value, JsValue>,
}

impl Converter {
    fn convert(&mut self, value: &Value) -> Result<JsValue, Error> {
        match value {
            Value::Null => Ok(JsValue::NULL),
            Value::Bool(bool) => Ok(JsValue::from_bool(*bool)),
            Value::Integer(integer) => convert_integer(*integer),
            Value::Float(float) => Ok(JsValue::from_f64(*float)),
            Value::String(string) => Ok(JsValue::from_str(utf8(string.as_bytes())?)),
            Value::Path(path) => Ok(JsValue::from_str(path.to_str().ok_or(Error::InvalidUtf8)?)),
            Value::List(list) => self.convert_list(list),
            Value::Attrs(attrs) => self.convert_attrs(attrs),

            // Strict evaluation forces every reachable thunk.
            Value::Thunk(thunk) if thunk.is_evaluated() => {
                let value = thunk.value().clone();
                self.convert(&value)
            }

            _ => Err(Error::Unconvertible(value.type_of())),
        }
    }

    fn convert_list(&mut self, list: &NixList) -> Result<JsValue, Error> {
        let identity = identity(list.iter().next());
        if let Some(array) = self.lookup(identity) {
            return Ok(array);
        }

        let array = Array::new();
        self.remember(identity, &array);
        for value in list {
            array.push(&self.convert(value)?);
        }

        Ok(array.into())
    }

    fn convert_attrs(&mut self, attrs: &NixAttrs) -> Result<JsValue, Error> {
        let identity = identity(attrs.iter().next().map(|(_, value)| value));
        if let Some(object) = self.lookup(identity) {
            return Ok(object);
        }

        // Without a prototype, any name is an own property: `__proto__`
        // included, and nothing is inherited from `Object.prototype`.
        let object: Object = Object::create(JsValue::NULL.unchecked_ref());
        self.remember(identity, &object);
        for (name, value) in attrs.iter_sorted() {
            let name = JsValue::from_str(utf8(name.as_bytes())?);
            Reflect::set(&object, &name, &self.convert(value)?)
                .map_err(|error| Error::Js(format!("{error:?}")))?;
        }

        Ok(object.into())
    }

    fn lookup(&self, identity: Option<*const Value>) -> Option<JsValue> {
        self.converted.get(&identity?).cloned()
    }

    fn remember(&mut self, identity: Option<*const Value>, converted: &JsValue) {
        if let Some(identity) = identity {
            self.converted.insert(identity, converted.clone());
        }
    }
}

/// Identifies a container by the address of its first child.
///
/// snix doesn't expose container pointers, but children are borrowed from
/// the container's shared allocation, so their address is the same for every
/// copy. The root value keeps all of them alive for the whole conversion, so
/// addresses can't be reused. They're compared, never dereferenced.
///
/// Empty containers have no identity. They can't be part of a cycle, so
/// converting them more than once is harmless.
fn identity(first_child: Option<&Value>) -> Option<*const Value> {
    first_child.map(ptr::from_ref)
}

fn convert_integer(integer: i64) -> Result<JsValue, Error> {
    if !(-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&integer) {
        return Err(Error::UnsafeInteger(integer));
    }

    #[expect(
        clippy::cast_precision_loss,
        reason = "Safe integers are exactly representable"
    )]
    Ok(JsValue::from_f64(integer as f64))
}

fn utf8(bytes: &[u8]) -> Result<&str, Error> {
    str::from_utf8(bytes).map_err(|_| Error::InvalidUtf8)
}
