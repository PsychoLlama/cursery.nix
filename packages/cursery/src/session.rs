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
use snix_eval::{EvalIO, EvalMode, Evaluation, EvaluationBuilder, GlobalsMap, SourceCode, Value};

use crate::{error::Error, memfs::MemoryFilesystem, store};

/// Top-level variables in scope during an evaluation.
pub(crate) type Variables = FxHashMap<SmolStr, Value>;

#[derive(Debug)]
pub(crate) struct Session {
    /// A snapshot: later loads and unloads don't affect the session.
    filesystem: MemoryFilesystem,
    bundled_path: PathBuf,
    globals: Rc<GlobalsMap>,
    source_map: SourceCode,
}

impl Session {
    pub(crate) fn new() -> Self {
        let (filesystem, bundled_path) = store::snapshot();
        let source_map = SourceCode::default();

        // Building an evaluation prepares the globals for its source map.
        let globals = builder(&filesystem, &bundled_path)
            .with_source_map(source_map.clone())
            .build()
            .globals();

        Self {
            filesystem,
            bundled_path,
            globals,
            source_map,
        }
    }

    /// Store path of the bundled library.
    pub(crate) fn bundled_path(&self) -> &Path {
        &self.bundled_path
    }

    /// Evaluate `code`, with `variables` in scope.
    pub(crate) fn evaluate(
        &self,
        code: &str,
        variables: Option<&Variables>,
        mode: EvalMode,
    ) -> Result<Value, Error> {
        let result = builder(&self.filesystem, &self.bundled_path)
            .with_globals(Rc::clone(&self.globals))
            .with_source_map(self.source_map.clone())
            .env(variables)
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
/// `<web>`.
fn builder<'env>(
    filesystem: &MemoryFilesystem,
    bundled_path: &Path,
) -> EvaluationBuilder<'static, 'static, 'env, Box<dyn EvalIO>> {
    let filesystem: Box<dyn EvalIO> = Box::new(filesystem.clone());
    Evaluation::builder_pure()
        .io_handle(filesystem)
        .enable_import()
        // Only `public/` is exposed, keeping internal modules out of `<web/...>`.
        .nix_path(Some(format!(
            "web={}",
            bundled_path.join("public").display()
        )))
}
