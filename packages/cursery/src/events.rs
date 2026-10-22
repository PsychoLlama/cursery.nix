//! Events, delegated to the containers apps are mounted into.
//!
//! A container gets one listener per event type its app handles. Listening in
//! the capture phase sees events that don't bubble (`focus`) too.

use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    rc::Rc,
};

use js_sys::{Object, Reflect};
use snix_eval::Value;
use wasm_bindgen::{JsCast, JsValue, prelude::Closure};
use web_sys::{Element, Event};

use rustc_hash::FxHashMap;

use crate::{
    app,
    derivations::{Builder, Inputs},
    error::Error,
};

/// Largest integer a JS number holds exactly (`Number.MAX_SAFE_INTEGER`).
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// Fields of the target copied into snapshots, for form controls.
const TARGET_FIELDS: [&str; 2] = ["value", "checked"];

type Listener = Closure<dyn Fn(Event)>;

/// A builder acting on an event, named `builtin:<name>`.
type Builtin = (&'static str, fn(&Event));

const BUILTINS: [Builtin; 1] = [("preventDefault", Event::prevent_default)];

/// Listeners on a container, removed when dropped.
#[derive(Debug)]
pub(crate) struct Listeners {
    container: Element,
    /// Keyed by event type.
    listeners: RefCell<BTreeMap<String, Listener>>,
}

impl Listeners {
    pub(crate) fn new(container: &Element) -> Self {
        Self {
            container: container.clone(),
            listeners: RefCell::default(),
        }
    }

    /// Listens for `types`, besides those already listened for.
    pub(crate) fn listen(&self, types: impl IntoIterator<Item = String>) -> Result<(), Error> {
        let mut listeners = self.listeners.borrow_mut();
        for event_type in types {
            if listeners.contains_key(&event_type) {
                continue;
            }

            let container = self.container.clone();
            let listener = Listener::new(move |event: Event| {
                // There's no caller to throw to.
                if let Err(error) = app::dispatch(&container, &event) {
                    web_sys::console::error_1(&error.to_string().into());
                }
            });

            self.container.add_event_listener_with_callback_and_bool(
                &event_type,
                listener.as_ref().unchecked_ref(),
                true,
            )?;

            listeners.insert(event_type, listener);
        }

        Ok(())
    }
}

impl Drop for Listeners {
    fn drop(&mut self) {
        for (event_type, listener) in self.listeners.get_mut() {
            // Only throws for invalid arguments.
            drop(self.container.remove_event_listener_with_callback_and_bool(
                event_type,
                listener.as_ref().unchecked_ref(),
                true,
            ));
        }
    }
}

/// Events while they dispatch, by `__id`, so builders can act on them.
#[derive(Debug, Default)]
pub(crate) struct Dispatching {
    events: RefCell<FxHashMap<i64, Event>>,
    next_id: Cell<i64>,
}

impl Dispatching {
    /// Tracks `event` until the returned guard drops.
    pub(crate) fn start(self: &Rc<Self>, event: &Event) -> Dispatch {
        let id = self.next_id.get();
        self.next_id.set(id + 1);
        self.events.borrow_mut().insert(id, event.clone());

        Dispatch {
            dispatching: Rc::clone(self),
            id,
        }
    }

    /// Builders acting on events, e.g. `builtin:preventDefault`. They
    /// take the event's `__id` as their `event` input.
    pub(crate) fn builders(self: &Rc<Self>) -> impl Iterator<Item = (String, Builder)> {
        BUILTINS.into_iter().map(|(name, run)| {
            let dispatching = Rc::clone(self);
            let builder: Builder = Rc::new(move |_co, inputs, _passthru| {
                let dispatching = Rc::clone(&dispatching);
                Box::pin(async move {
                    run(&dispatching.find(name, &inputs)?);
                    Ok(Value::Null)
                })
            });

            (format!("builtin:{name}"), builder)
        })
    }

    /// The event builder `name` acts on, from its inputs.
    fn find(&self, name: &str, inputs: &Inputs) -> Result<Event, String> {
        let input = inputs.get("event").ok_or_else(|| {
            format!("Cannot {name} without an event: set `event` to the event's `__id`")
        })?;

        let id = input
            .parse()
            .ok()
            .filter(|id| (0..self.next_id.get()).contains(id))
            .ok_or_else(|| {
                format!("Cannot {name}: `event` is {input:?}, which is not an event's `__id`")
            })?;

        self.events
            .borrow()
            .get(&id)
            .cloned()
            .ok_or_else(|| format!("Cannot {name}: event {id} finished dispatching"))
    }
}

/// An event dispatching, until dropped.
#[derive(Debug)]
pub(crate) struct Dispatch {
    dispatching: Rc<Dispatching>,
    id: i64,
}

impl Drop for Dispatch {
    fn drop(&mut self) {
        self.dispatching.events.borrow_mut().remove(&self.id);
    }
}

/// A plain-data copy of `event` for handlers: its strings, numbers and
/// booleans (`type`, `key`, `shiftKey`, ...), and `target` with the fields
/// form controls need (`value`, `checked`). `__id` identifies it to builders
/// while it's `dispatch`ing.
pub(crate) fn snapshot(event: &Event, dispatch: &Dispatch) -> Result<Value, Error> {
    let mut fields = fields(event, event)?;
    fields.insert("__id".to_owned(), Value::Integer(dispatch.id));

    if let Some(target) = event.target() {
        let mut copied = BTreeMap::new();
        for name in TARGET_FIELDS {
            if let Some(value) = primitive(&Reflect::get(&target, &name.into())?) {
                copied.insert(name, value);
            }
        }

        fields.insert(
            "target".to_owned(),
            Value::attrs(copied.into_iter().collect()),
        );
    }

    Ok(Value::attrs(fields.into_iter().collect()))
}

/// Primitive fields of `object`: its own, and the getters it inherits. Data
/// properties it inherits are constants like `Event.AT_TARGET`, so they're
/// skipped.
fn fields(object: &JsValue, own: &Object) -> Result<BTreeMap<String, Value>, Error> {
    let mut fields = BTreeMap::new();
    let mut prototype: JsValue = own.clone().into();
    while let Some(current) = prototype.dyn_ref::<Object>() {
        for name in Object::get_own_property_names(current) {
            let Some(key) = name.as_string() else {
                continue;
            };

            let descriptor = Reflect::get_own_property_descriptor(current, &name)?;
            let inherited_data = current != own && !Reflect::has(&descriptor, &"get".into())?;
            if inherited_data || fields.contains_key(&key) {
                continue;
            }

            if let Some(value) = primitive(&Reflect::get(object, &name)?) {
                fields.insert(key, value);
            }
        }

        prototype = Object::get_prototype_of(current).into();
    }

    Ok(fields)
}

/// Converts strings, numbers and booleans. Integral numbers become integers.
fn primitive(value: &JsValue) -> Option<Value> {
    if let Some(string) = value.as_string() {
        return Some(Value::String(string.into()));
    }

    if let Some(bool) = value.as_bool() {
        return Some(Value::Bool(bool));
    }

    let number = value.as_f64()?;
    if number.fract() == 0.0 && number.abs() <= MAX_SAFE_INTEGER {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "Safe integers are exactly representable"
        )]
        return Some(Value::Integer(number as i64));
    }

    Some(Value::Float(number))
}
