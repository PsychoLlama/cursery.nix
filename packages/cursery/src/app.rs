//! Apps mounted into containers: rendering, and handling their events.

use std::{cell::Cell, iter, path::PathBuf, rc::Rc};

use snix_eval::{
    EvalMode, NixAttrs, Value,
    generators::{self, GenCo},
};
use web_sys::{Element, Event};

use crate::{
    derivations::{Builder, Inputs},
    error::Error,
    events::{self, Dispatching, Listeners},
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
pub(crate) fn mount(container: &Element, path: &str) -> Result<(), Error> {
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
        tree: field(&result, "children")?,
        kept: field(&result, "kept")?,
        listeners,
        globals,
    };

    commit(container, previous.as_ref(), mount)
}

/// Handles `event` for the app mounted into `container`, calling each
/// handler in turn and running the effects it returns, in order.
/// `builtin:dispatch` renders as it goes: if an effect fails, earlier ones
/// stay rendered and later ones don't run.
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

    // Builders act on the event only while it dispatches.
    let dispatch = mount.session.dispatching().start(container, event);
    let event = events::snapshot(event, &dispatch)?;
    for handler in handlers {
        let effects = mount.session.evaluate(
            "renderer.handle handler event",
            &[
                ("renderer", mount.renderer.clone()),
                ("handler", handler),
                ("event", event.clone()),
            ],
            EvalMode::Strict,
        )?;

        // Each in its own evaluation, so one doesn't force another, and the
        // same effect twice runs twice rather than hitting the import cache.
        for effect in &effects.to_list()? {
            mount.session.evaluate(
                "renderer.run effect",
                &[
                    ("renderer", mount.renderer.clone()),
                    ("effect", effect.clone()),
                ],
                EvalMode::Strict,
            )?;
        }
    }

    Ok(())
}

/// Builders acting on apps: `builtin:dispatch`.
pub(crate) fn builders(dispatching: &Rc<Dispatching>) -> impl Iterator<Item = (String, Builder)> {
    let dispatching = Rc::clone(dispatching);
    let builder: Builder = Rc::new(move |co, inputs, passthru| {
        let dispatching = Rc::clone(&dispatching);
        Box::pin(async move { update(co, &dispatching, inputs, passthru).await })
    });

    iter::once(("builtin:dispatch".to_owned(), builder))
}

/// Applies the action a `dispatch` derivation describes to the app whose
/// handlers are running, renders it, and returns the next state.
///
/// The action is `{ type = <action input>; payload = <passthru.payload>; }`,
/// without `payload` if none was given.
async fn update(
    co: &GenCo,
    dispatching: &Rc<Dispatching>,
    inputs: Inputs,
    passthru: Value,
) -> Result<Value, String> {
    let container = dispatching
        .handling()
        .ok_or("Cannot dispatch outside an event handler")?;
    let mount = mounts::get(&container).ok_or_else(|| Error::NotMounted.to_string())?;
    let action = action(co, inputs, passthru).await?;
    if action.is_catchable() {
        return Ok(action);
    }

    let renderer = generators::request_force(co, mount.renderer.clone()).await;
    let renderer = renderer.to_attrs().map_err(|error| error.to_string())?;
    let function = |name| {
        renderer
            .select(name)
            .cloned()
            .ok_or_else(|| Error::InvalidRenderer(format!("missing {name:?}")).to_string())
    };

    // `update` and `render` can't dispatch.
    let paused = dispatching.pause();
    let kept =
        generators::request_call_with(co, function("update")?, [mount.kept.clone(), action]).await;
    let kept = generators::request_deep_force(co, kept).await;
    if kept.is_catchable() {
        return Ok(kept);
    }

    let tree = generators::request_call_with(co, function("view")?, [kept.clone()]).await;
    let tree = generators::request_deep_force(co, tree).await;
    if tree.is_catchable() {
        return Ok(tree);
    }
    drop(paused);

    let attrs = kept.to_attrs().map_err(|error| error.to_string())?;
    let state = attrs.select("state").cloned().unwrap_or(Value::Null);
    let next = Mount {
        tree,
        kept,
        ..mount.clone()
    };

    commit(&container, Some(&mount), next).map_err(|error| error.to_string())?;
    Ok(state)
}

/// The action a `dispatch` derivation describes, or a catchable error from
/// forcing its `passthru`.
async fn action(co: &GenCo, inputs: Inputs, passthru: Value) -> Result<Value, String> {
    let kind = inputs
        .get("action")
        .ok_or("Cannot dispatch without an `action`")?;
    let mut fields = vec![("type", Value::from(kind.clone()))];

    let passthru = generators::request_force(co, passthru).await;
    if passthru.is_catchable() {
        return Ok(passthru);
    }

    if !matches!(passthru, Value::Null) {
        let passthru = passthru.to_attrs().map_err(|error| error.to_string())?;
        if let Some(payload) = passthru.select("payload") {
            fields.push(("payload", payload.clone()));
        }
    }

    Ok(Value::attrs(NixAttrs::from_iter(fields)))
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
