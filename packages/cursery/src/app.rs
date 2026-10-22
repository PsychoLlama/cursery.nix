//! Apps mounted into containers: rendering, and handling their events.

use std::{path::PathBuf, rc::Rc};

use snix_eval::{EvalMode, NixAttrs, Value};
use web_sys::{Element, Event};

use crate::{
    error::Error,
    events::{self, Listeners},
    mounts::{self, Mount},
    session::Session,
    virtual_dom::{self, handlers},
};

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

    let mount = Mount {
        session: Rc::new(session),
        renderer,
        tree: field(&result, "children")?,
        kept: field(&result, "kept")?,
        listeners,
    };

    commit(container, previous.as_ref(), mount)
}

/// Handles `event` for the app mounted into `container`. Each handler's
/// action is applied in turn, then the app renders once. If any fails, the
/// app is left as it was.
pub(crate) fn dispatch(container: &Element, event: &Event) -> Result<(), Error> {
    let Some(mount) = mounts::get(container) else {
        return Ok(());
    };

    let handlers = handlers::find(container, &mount.tree, event)?;
    if handlers.is_empty() {
        return Ok(());
    }

    let event = events::snapshot(event)?;
    let mut kept = None;
    for handler in handlers {
        let result = mount.session.evaluate(
            "renderer.handle kept handler event",
            &[
                ("renderer", mount.renderer.clone()),
                ("kept", kept.clone().unwrap_or_else(|| mount.kept.clone())),
                ("handler", handler),
                ("event", event.clone()),
            ],
            EvalMode::Strict,
        )?;

        if !is_null(&result) {
            kept = Some(result);
        }
    }

    // Every handler ignored the event.
    let Some(kept) = kept else {
        return Ok(());
    };

    let tree = mount.session.evaluate(
        "renderer.view kept",
        &[("renderer", mount.renderer.clone()), ("kept", kept.clone())],
        EvalMode::Strict,
    )?;

    let next = Mount {
        tree,
        kept,
        ..mount.clone()
    };

    commit(container, Some(&mount), next)
}

/// Renders `mount` into `container`, patching from `previous`, and records it.
fn commit(container: &Element, previous: Option<&Mount>, mount: Mount) -> Result<(), Error> {
    mount.listeners.listen(handlers::types(&mount.tree)?)?;
    virtual_dom::render(container, previous.map(|mount| &mount.tree), &mount.tree)?;

    mounts::insert(container, mount);
    Ok(())
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
