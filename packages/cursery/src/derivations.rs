//! Side effects, as derivations. `derivation` describes an effect, and
//! importing it (import from derivation) runs it:
//!
//!   import (derivation {
//!     name = "failure";
//!     builder = "builtin:fail";
//!     message = "nope";
//!   })
//!
//! The import evaluates to the effect's result, or throws if it failed. The
//! throw is catchable (`tryEval`), unlike a failed import.
//!
//! Builders are strings naming host effects, like Nix's `builtin:fetchurl`.
//! They see the derivation's attributes as inputs, coerced to strings as by
//! Nix, e.g. which event to act on.
//!
//! `passthru` is the exception: it isn't coerced or hashed, and builders get
//! it as a Nix value, e.g. an action's payload. Derivations that differ only
//! in `passthru` share an output path.
//!
//! Inputs are hashed into the output path. Importing the same output twice in
//! one evaluation runs it once, because snix caches imports by path.

use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    fmt,
    future::Future,
    io::{self, Cursor, Read},
    path::{Path, PathBuf},
    pin::Pin,
    rc::Rc,
};

use rustc_hash::FxHashMap;
use sha2::{Digest, Sha256};
use snix_eval::{EvalIO, FileType, Value, builtin_macros::builtins, generators::GenCo};

use crate::{memfs::MemoryFilesystem, store_path::output_path};

pub(crate) use derivation_builtins::builtins as derivation_builtins;
pub(crate) use global_builtins::builtins as global_builtins;

/// A derivation's attributes, coerced to strings.
pub(crate) type Inputs = BTreeMap<String, String>;

/// A running build: its result, or why it failed.
pub(crate) type Build<'co> = Pin<Box<dyn Future<Output = Result<Value, String>> + 'co>>;

/// Runs an effect, given its derivation's inputs and `passthru`. Builders
/// are async, so they can call back into the evaluation through `co`, e.g.
/// to force `passthru`. A catchable error they return propagates as if the
/// `import` threw it.
pub(crate) type Builder = Rc<dyn for<'co> Fn(&'co GenCo, Inputs, Value) -> Build<'co>>;

/// What a derivation recorded for its builder.
#[derive(Debug, Clone)]
struct Recorded {
    inputs: Inputs,

    /// Unforced, or `null` without one.
    passthru: Value,
}

/// Derivations and builders of a session.
pub(crate) struct Derivations {
    /// Derivations, keyed by output path. Never pruned: an output may be
    /// imported in any later evaluation. The latest of those sharing an
    /// output path wins.
    outputs: RefCell<FxHashMap<PathBuf, Recorded>>,

    /// Keyed by the string derivations name them by.
    builders: FxHashMap<String, Builder>,

    /// See `builtins.__currentGeneration`.
    generation: Cell<i64>,
}

impl fmt::Debug for Derivations {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Derivations")
            .field("outputs", &self.outputs)
            .field("builders", &self.builders.keys())
            .field("generation", &self.generation)
            .finish()
    }
}

impl Derivations {
    /// Starts a new generation, e.g. for each evaluation.
    pub(crate) fn advance(&self) {
        self.generation.set(self.generation.get() + 1);
    }

    pub(crate) fn new(builders: impl IntoIterator<Item = (String, Builder)>) -> Self {
        Self {
            outputs: RefCell::default(),
            builders: builders.into_iter().collect(),
            generation: Cell::default(),
        }
    }
}

/// Serves outputs of `derivations` as Nix files, and everything else from
/// `filesystem`.
#[derive(Debug, Clone)]
pub(crate) struct DerivationsIO {
    pub(crate) filesystem: MemoryFilesystem,
    pub(crate) derivations: Rc<Derivations>,
}

impl DerivationsIO {
    fn is_output(&self, path: &Path) -> bool {
        self.derivations.outputs.borrow().contains_key(path)
    }
}

impl EvalIO for DerivationsIO {
    fn path_exists(&self, path: &Path) -> io::Result<bool> {
        Ok(self.is_output(path) || self.filesystem.path_exists(path)?)
    }

    /// An output is a file that realises it. Its result comes from the
    /// builtin as a value, keeping it out of the source map.
    fn open(&self, path: &Path) -> io::Result<Box<dyn Read>> {
        if !self.is_output(path) {
            return self.filesystem.open(path);
        }

        // Store paths need no escaping.
        let source = format!("builtins.__derivation.realise \"{}\"", path.display());
        Ok(Box::new(Cursor::new(source.into_bytes())))
    }

    fn file_type(&self, path: &Path) -> io::Result<FileType> {
        if self.is_output(path) {
            return Ok(FileType::Regular);
        }

        self.filesystem.file_type(path)
    }

    fn read_dir(&self, path: &Path) -> io::Result<Vec<(bytes::Bytes, FileType)>> {
        self.filesystem.read_dir(path)
    }

    fn import_path(&self, path: &Path) -> io::Result<PathBuf> {
        self.filesystem.import_path(path)
    }

    fn get_env(&self, key: &OsStr) -> Option<OsString> {
        self.filesystem.get_env(key)
    }
}

/// Characters Nix allows in store path names.
fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && name
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || "+-._?=".contains(char))
}

/// Adds `bytes` to `hash`, prefixed by its length so fields can't run
/// together.
fn update(hash: &mut Sha256, bytes: &[u8]) {
    hash.update((bytes.len() as u64).to_le_bytes());
    hash.update(bytes);
}

#[expect(
    unused_qualifications,
    reason = "`#[builtins]` qualifies paths that are imported"
)]
#[builtins(state = "Rc<Derivations>")]
mod global_builtins {
    use std::rc::Rc;

    use snix_eval::{
        CoercionKind, ErrorKind, NixAttrs, Value,
        generators::{self, Gen, GenCo},
    };

    use super::{
        Derivations, Digest, Inputs, Recorded, Sha256, is_valid_name, output_path, update,
    };

    /// Describes an effect, run by importing it. Attributes are coerced to
    /// strings, as by Nix, and hashed into the output path, except
    /// `passthru`, which is kept as is. Returns the
    /// attributes with `type = "derivation"` and `outPath`, overriding any
    /// given.
    #[builtin("derivation")]
    async fn builtin_derivation(
        state: Rc<Derivations>,
        co: GenCo,
        attrs: Value,
    ) -> Result<Value, ErrorKind> {
        let attrs = attrs.to_attrs()?;
        let fields: Vec<_> = attrs
            .iter_sorted()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();

        let mut hash = Sha256::new();
        let mut inputs = Inputs::new();
        let mut passthru = Value::Null;
        for (key, value) in fields {
            if key.as_bytes() == b"passthru" {
                passthru = value;
                continue;
            }

            let kind = CoercionKind {
                strong: true,
                import_paths: true,
            };

            let string = match generators::request_string_coerce(&co, value, kind).await {
                Ok(string) => String::from_utf8_lossy(string.as_bytes()).into_owned(),
                Err(error) => return Ok(Value::from(error)),
            };

            update(&mut hash, key.as_bytes());
            update(&mut hash, string.as_bytes());
            inputs.insert(String::from_utf8_lossy(key.as_bytes()).into_owned(), string);
        }

        for required in ["name", "builder"] {
            if !inputs.contains_key(required) {
                return Err(ErrorKind::AttributeNotFound {
                    name: required.to_owned(),
                });
            }
        }

        let name = &inputs["name"];
        if !is_valid_name(name) {
            return Err(ErrorKind::Abort(format!(
                "Invalid derivation name {name:?}: must be a valid store path name"
            )));
        }

        let path = output_path(&format!("{:x}", hash.finalize()), name);
        let attrs = attrs.update(NixAttrs::from_iter([
            ("type", Value::from("derivation")),
            ("outPath", Value::from(path.display().to_string())),
        ]));

        state
            .outputs
            .borrow_mut()
            .insert(path, Recorded { inputs, passthru });

        Ok(Value::attrs(attrs))
    }

    /// The current generation, which advances with each evaluation and
    /// after each build. Derivations that hash it, e.g. `io.dispatch`, are
    /// distinct from those made before, so importing them runs them again
    /// rather than hitting the import cache.
    ///
    /// Takes and ignores an argument, as Nix has no nullary functions. Pass
    /// something local, e.g. the enclosing function's argument: snix
    /// evaluates an expression without free variables once and shares it,
    /// so `builtins.__currentGeneration null` would never advance.
    #[builtin("__currentGeneration")]
    #[expect(
        clippy::unused_async,
        unused_variables,
        reason = "`#[builtins]` requires async builtins that take `co`"
    )]
    async fn builtin_current_generation(
        state: Rc<Derivations>,
        co: GenCo,
        #[lazy] _argument: Value,
    ) -> Result<Value, ErrorKind> {
        Ok(Value::Integer(state.generation.get()))
    }
}

#[builtins(state = "Rc<Derivations>")]
mod derivation_builtins {
    use std::{path::PathBuf, rc::Rc};

    use snix_eval::{
        CatchableErrorKind, ErrorKind, Value,
        generators::{Gen, GenCo},
    };

    use super::{Derivations, Recorded};

    /// Runs the derivation that outputs `path`, through its builder,
    /// returning its result or throwing why it failed. Imported outputs
    /// call this, keeping the source they're served as short: imports are
    /// cached and their source is never freed.
    #[builtin("realise")]
    async fn builtin_realise(
        state: Rc<Derivations>,
        co: GenCo,
        path: Value,
    ) -> Result<Value, ErrorKind> {
        let path = PathBuf::from(String::from_utf8_lossy(path.to_str()?.as_bytes()).as_ref());
        let Recorded { inputs, passthru } =
            state.outputs.borrow().get(&path).cloned().ok_or_else(|| {
                ErrorKind::Abort(format!("No derivation outputs {}", path.display()))
            })?;

        let builder = &inputs["builder"];
        let result = match state.builders.get(builder).cloned() {
            Some(run) => run(&co, inputs, passthru).await,
            None => Err(format!("Unknown builder {builder:?}")),
        };
        state.advance();

        Ok(result.unwrap_or_else(|error| CatchableErrorKind::Throw(error.into()).into()))
    }
}
