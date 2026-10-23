//! Evaluations that share values.
//!
//! A value from one evaluation can be passed into another through its
//! variables, e.g. to call a function kept from an earlier evaluation. snix
//! requires such evaluations to share their globals and source map, so a
//! session holds both.

use std::{
    path::{Path, PathBuf},
    rc::Rc,
};

use rustc_hash::FxHashMap;
use smol_str::SmolStr;
use snix_eval::{
    EvalIO, EvalMode, Evaluation, EvaluationBuilder, GlobalsMap, NixAttrs, SourceCode, Value,
};

use crate::{
    derivations::{self, Derivations, DerivationsIO},
    error::Error,
    events::Dispatching,
    memfs::MemoryFilesystem,
    store,
};

#[derive(Debug)]
pub(crate) struct Session {
    /// A snapshot: later loads and unloads don't affect the session.
    filesystem: MemoryFilesystem,
    bundled_path: PathBuf,
    globals: Rc<GlobalsMap>,
    source_map: SourceCode,
    derivations: Rc<Derivations>,
    dispatching: Rc<Dispatching>,
}

impl Session {
    pub(crate) fn new() -> Self {
        let (filesystem, bundled_path) = store::snapshot();
        let source_map = SourceCode::default();
        let dispatching = Rc::new(Dispatching::default());
        let derivations = Rc::new(Derivations::new([]));

        // Building an evaluation prepares the globals for its source map.
        let globals = builder(&filesystem, &bundled_path, &derivations)
            .add_builtins(derivations::global_builtins(Rc::clone(&derivations)))
            .add_builtins([(
                "__derivation",
                Value::attrs(NixAttrs::from_iter(derivations::derivation_builtins(
                    Rc::clone(&derivations),
                ))),
            )])
            .with_source_map(source_map.clone())
            .build()
            .globals();

        Self {
            filesystem,
            bundled_path,
            globals,
            source_map,
            derivations,
            dispatching,
        }
    }

    /// Store path of the bundled library.
    pub(crate) fn bundled_path(&self) -> &Path {
        &self.bundled_path
    }

    /// Events dispatching to the session.
    pub(crate) fn dispatching(&self) -> &Rc<Dispatching> {
        &self.dispatching
    }

    /// Evaluate `code`, with `variables` in scope.
    pub(crate) fn evaluate(
        &self,
        code: &str,
        variables: &[(&'static str, Value)],
        mode: EvalMode,
    ) -> Result<Value, Error> {
        let variables: FxHashMap<SmolStr, Value> = variables
            .iter()
            .map(|(name, value)| (SmolStr::new_static(name), value.clone()))
            .collect();

        self.derivations.advance();
        let result = builder(&self.filesystem, &self.bundled_path, &self.derivations)
            .with_globals(Rc::clone(&self.globals))
            .with_source_map(self.source_map.clone())
            .env(Some(&variables))
            .mode(mode)
            .build()
            // Without a location, snix falls back to `current_dir()`, which is
            // unsupported on wasm. There is no filesystem, so any root will do.
            .evaluate(code, Some(PathBuf::from("/tmp")));

        if let Some(error) = result.errors.into_iter().next() {
            return Err(Error::Eval(error));
        }

        result.value.ok_or(Error::NoValue)
    }
}

/// Evaluation is pure: impure builtins are unavailable. Loaded files are
/// importable by path, and bundled libraries through the search path as
/// `<web>`. Derivations are importable once described (see `derivations`).
fn builder<'env>(
    filesystem: &MemoryFilesystem,
    bundled_path: &Path,
    derivations: &Rc<Derivations>,
) -> EvaluationBuilder<'static, 'static, 'env, Box<dyn EvalIO>> {
    let io: Box<dyn EvalIO> = Box::new(DerivationsIO {
        filesystem: filesystem.clone(),
        derivations: Rc::clone(derivations),
    });
    Evaluation::builder_pure()
        .io_handle(io)
        .enable_import()
        // Only `web/` is exposed, keeping internal modules out of `<web/...>`.
        .nix_path(Some(format!("web={}", bundled_path.join("web").display())))
}
