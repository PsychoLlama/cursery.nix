//! Apps mounted into containers: rendering, and handling their events.

use std::{cell::Cell, iter, path::PathBuf, rc::Rc};

use snix_eval::{EvalMode, NixAttrs, Value};
use wasm_bindgen::JsValue;
use web_sys::{Element, Event};

use crate::{
    calls::Calls,
    effects,
    error::Error,
    events::{self, Listeners},
    mounts::{self, Mount},
    session::Session,
    virtual_dom::{
        self, handlers,
        styles::{self, Globals},
    },
};

thread_local! {
    /// Whether a commit is patching the DOM. See [`dispatch`].
    static COMMITTING: Cell<bool> = const { Cell::new(false) };
}

/// See the `mount` export.
pub(crate) fn mount(container: &Element, path: &str, options: &JsValue) -> Result<(), Error> {
    let calls = Calls::new(options)?;
    let session = Session::new();
    let previous = mounts::get(container);

    // The app is evaluated once, leaving a renderer to call.
    let renderer = session.evaluate(
        "import renderer (import app)",
        &[
            (
                "renderer",
                nix_path(session.bundled_path().join("internal/render.nix")),
            ),
            ("app", nix_path(PathBuf::from(path))),
        ],
        EvalMode::Lazy,
    )?;

    let effects = session.evaluate(
        "import effects",
        &[(
            "effects",
            nix_path(session.bundled_path().join("internal/io/effects.nix")),
        )],
        EvalMode::Lazy,
    )?;

    let kept = previous
        .as_ref()
        .map_or(Value::Null, |mount| mount.kept.clone());
    let result = session
        .evaluate(
            "renderer.mount kept",
            &[("renderer", renderer.clone()), ("kept", kept)],
            EvalMode::Strict,
        )?
        .to_attrs()
        .map_err(|error| Error::InvalidRenderer(error.to_string()))?;

    let listeners = previous.as_ref().map_or_else(
        || Rc::new(Listeners::new(container)),
        |mount| Rc::clone(&mount.listeners),
    );

    let styles = field(&result, "styles")?;
    let globals = if is_null(&styles) {
        None
    } else {
        let css = styles.to_str()?;
        let css = str::from_utf8(css.as_bytes()).map_err(|_| Error::InvalidUtf8)?;
        match previous.as_ref().and_then(|mount| mount.globals.clone()) {
            Some(globals) if globals.css() == css => Some(globals),
            _ => Some(Rc::new(Globals::new(container, css.to_owned())?)),
        }
    };

    let mount = Mount {
        session: Rc::new(session),
        renderer,
        effects,
        calls,
        tree: field(&result, "children")?,
        kept: field(&result, "kept")?,
        listeners,
        globals,
    };

    commit(container, previous.as_ref(), mount)
}

/// Handles `event` for the app mounted into `container`, calling each
/// handler in turn and running the effect it returns (see [`run`]).
/// `dispatch` effects render as they go: if an effect fails, earlier ones
/// stay rendered.
///
/// Events fired while committing are ignored, e.g. `blur` from removing a
/// focused element. They're artifacts of patching, not things people did,
/// and handling them would patch the DOM underneath the commit.
pub(crate) fn dispatch(container: &Element, event: &Event) -> Result<(), Error> {
    if COMMITTING.get() {
        return Ok(());
    }

    let Some(mount) = mounts::get(container) else {
        return Ok(());
    };

    let handlers = handlers::find(container, &mount.tree, event)?;
    if handlers.is_empty() {
        return Ok(());
    }

    // Effects act on the event only while it dispatches.
    let dispatch = mount.session.dispatching().start(event);
    let event = events::snapshot(event, &dispatch)?;
    for handler in handlers {
        let effect = mount.session.evaluate(
            "renderer.handle handler event",
            &[
                ("renderer", mount.renderer.clone()),
                ("handler", handler),
                ("event", event.clone()),
            ],
            EvalMode::Strict,
        )?;

        if !is_null(&effect) {
            run(container, &mount, effect)?;
        }
    }

    Ok(())
}

/// Runs an effect a handler returned, following `io` chains: each source
/// runs before its function is called with the output, and whatever the
/// function returns runs next. Pending functions and `io.catch` handlers
/// wait on a stack, so nesting goes as deep as it likes.
///
/// A failure skips functions until a handler catches it, like a rejected
/// promise. A failure nothing catches is returned. Values passed on are
/// deep-forced, so a throw in one fails at the step that made it.
///
/// Each step is its own evaluation, so one doesn't force another.
fn run(container: &Element, mount: &Mount, effect: Value) -> Result<(), Error> {
    let mut pending = Vec::new();
    let mut current = step(mount, "effects.step value", &[("value", effect)]);
    loop {
        let mut output = match current {
            Err(error) => Err(error),
            Ok(attrs) => {
                if let Some(effect) = attrs.select("effect") {
                    effects::run(container, mount, effect)
                } else if let Some(source) = attrs.select("source") {
                    pending.push(match attrs.select("catch") {
                        Some(catch) => Pending::Catch(catch.clone()),
                        None => Pending::Next(select(&attrs, "next")?),
                    });
                    current = step(mount, "effects.step value", &[("value", source.clone())]);
                    continue;
                } else {
                    mount.session.evaluate(
                        "value",
                        &[("value", select(&attrs, "value")?)],
                        EvalMode::Strict,
                    )
                }
            }
        };

        // Unwinds to the function or handler that takes the output.
        current = loop {
            output = match (pending.pop(), output) {
                (None, output) => return output.map(drop),
                (Some(Pending::Next(next)), Ok(output)) => {
                    break step(
                        mount,
                        "effects.step (next output)",
                        &[("next", next), ("output", output)],
                    );
                }
                (Some(Pending::Catch(catch)), Err(error)) => {
                    let error = NixAttrs::from_iter([("message", Value::from(error.message()))]);
                    break step(
                        mount,
                        "effects.step (catch error)",
                        &[("catch", catch), ("error", Value::attrs(error))],
                    );
                }
                (Some(_), output) => output,
            };
        };
    }
}

/// What a chain does with the output of the step it's waiting on.
enum Pending {
    /// Calls the function with a success.
    Next(Value),

    /// Calls the `io.catch` handler with a failure.
    Catch(Value),
}

/// Lazily evaluates a call to `effects.step`, with `effects` and `bindings`
/// in scope: what it steps through, e.g. an output, is only forced as
/// needed.
fn step(mount: &Mount, code: &str, bindings: &[(&'static str, Value)]) -> Result<NixAttrs, Error> {
    let bindings: Vec<_> = iter::once(("effects", mount.effects.clone()))
        .chain(bindings.iter().cloned())
        .collect();
    mount
        .session
        .evaluate(code, &bindings, EvalMode::Lazy)?
        .to_attrs()
        .map_err(|error| Error::InvalidStep(error.to_string()))
}

/// Selects `name` from what `effects.step` returned.
fn select(attrs: &NixAttrs, name: &'static str) -> Result<Value, Error> {
    attrs
        .select(name)
        .cloned()
        .ok_or_else(|| Error::InvalidStep(format!("missing {name:?}")))
}

/// Runs a `dispatch` effect: applies `action` to the app in `container`,
/// renders it, and outputs the next state. The app is looked up afresh, as
/// an earlier dispatch in the same chain may have updated it.
pub(crate) fn update(container: &Element, action: Value) -> Result<Value, Error> {
    let mount = mounts::get(container).ok_or(Error::NotMounted)?;
    let kept = mount.session.evaluate(
        "renderer.update kept action",
        &[
            ("renderer", mount.renderer.clone()),
            ("kept", mount.kept.clone()),
            ("action", action),
        ],
        EvalMode::Strict,
    )?;

    let tree = mount.session.evaluate(
        "renderer.view kept",
        &[("renderer", mount.renderer.clone()), ("kept", kept.clone())],
        EvalMode::Strict,
    )?;

    let state = kept
        .to_attrs()
        .map_err(|error| Error::InvalidRenderer(error.to_string()))?
        .select("state")
        .cloned()
        .unwrap_or(Value::Null);

    let next = Mount {
        tree,
        kept,
        ..mount.clone()
    };

    commit(container, Some(&mount), next)?;
    Ok(state)
}

/// Renders `mount` into `container`, patching from `previous`, and records it.
fn commit(container: &Element, previous: Option<&Mount>, mount: Mount) -> Result<(), Error> {
    let _committing = Committing::start();
    mount.listeners.listen(handlers::types(&mount.tree)?)?;
    styles::load(container, &mount.tree)?;
    virtual_dom::render(container, previous.map(|mount| &mount.tree), &mount.tree)?;

    mounts::insert(container, mount);
    Ok(())
}

/// A commit patching the DOM, until dropped.
struct Committing;

impl Committing {
    fn start() -> Self {
        COMMITTING.set(true);
        Self
    }
}

impl Drop for Committing {
    fn drop(&mut self) {
        COMMITTING.set(false);
    }
}

/// Selects `name` from what the renderer returned.
fn field(attrs: &NixAttrs, name: &'static str) -> Result<Value, Error> {
    attrs
        .select(name)
        .cloned()
        .ok_or_else(|| Error::InvalidRenderer(format!("missing {name:?}")))
}

/// Sees through thunks, which strict evaluation has already forced.
fn is_null(value: &Value) -> bool {
    match value {
        Value::Thunk(thunk) => is_null(&thunk.value()),
        value => matches!(value, Value::Null),
    }
}

fn nix_path(path: PathBuf) -> Value {
    Value::Path(Box::new(path))
}
