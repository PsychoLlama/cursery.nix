//! `builtin:fail`: failures passed down `io.map` chains (see `run` in
//! `app.rs`). The next function gets `import` of a failure derivation, so
//! forcing the output runs the builder, which marks the failure handled and
//! throws it. Failures nothing forced are reported once the chain ends, like
//! unhandled promise rejections.

use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    iter,
    rc::Rc,
};

use crate::derivations::Builder;

#[derive(Debug, Default)]
pub(crate) struct Failures {
    next_id: Cell<u64>,

    /// Messages of failures not yet forced, by ID.
    unhandled: RefCell<BTreeMap<u64, String>>,
}

impl Failures {
    /// Records an unhandled failure, returning its ID for `builtin:fail`.
    pub(crate) fn record(&self, message: String) -> u64 {
        let id = self.next_id.get();
        self.next_id.set(id + 1);
        self.unhandled.borrow_mut().insert(id, message);
        id
    }

    /// Forgets a failure, returning its message if nothing forced it.
    pub(crate) fn settle(&self, id: u64) -> Option<String> {
        self.unhandled.borrow_mut().remove(&id)
    }

    /// Builders for failures: `builtin:fail`, taking the failure's `id` and
    /// `message` as inputs.
    pub(crate) fn builders(self: &Rc<Self>) -> impl Iterator<Item = (String, Builder)> {
        let failures = Rc::clone(self);
        let builder: Builder = Rc::new(move |_co, inputs, _passthru| {
            let failures = Rc::clone(&failures);
            Box::pin(async move {
                if let Some(id) = inputs.get("id").and_then(|id| id.parse().ok()) {
                    failures.settle(id);
                }

                Err(inputs.get("message").cloned().unwrap_or_default())
            })
        });

        iter::once(("builtin:fail".to_owned(), builder))
    }
}
