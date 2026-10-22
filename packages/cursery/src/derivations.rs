//! Side effects, as derivations. `derivation` describes an effect, and
//! importing it (import from derivation) runs it:
//!
//!   import (event.preventDefault { })
//!
//! Where `internal/io/event.nix` defines it as:
//!
//!   derivation {
//!     name = "preventDefault";
//!     builder = "builtin:preventDefault";
//!     event = snapshot.__id;
//!   }
//!
//! The import evaluates to `{ type = "success"; value; }`, or
//! `{ type = "error"; error; }` if the effect failed.
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
    cell::RefCell,
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    fmt,
    io::{self, Cursor, Read},
    path::{Path, PathBuf},
    rc::Rc,
};

use rustc_hash::FxHashMap;
use sha2::{Digest, Sha256};
use snix_eval::{EvalIO, FileType, Value, builtin_macros::builtins};

use crate::{memfs::MemoryFilesystem, store_path::output_path};

pub(crate) use derivation_builtins::builtins as derivation_builtins;
pub(crate) use global_builtins::builtins as global_builtins;

/// A derivation's attributes, coerced to strings.
pub(crate) type Inputs = BTreeMap<String, String>;

/// Runs an effect, given its derivation's inputs and `passthru`.
pub(crate) type Builder = Rc<dyn Fn(&Inputs, &Value) -> Result<Value, String>>;

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
}

impl fmt::Debug for Derivations {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Derivations")
            .field("outputs", &self.outputs)
            .field("builders", &self.builders.keys())
            .finish()
    }
}

impl Derivations {
    pub(crate) fn new(builders: impl IntoIterator<Item = (String, Builder)>) -> Self {
        Self {
            outputs: RefCell::default(),
            builders: builders.into_iter().collect(),
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
}

#[builtins(state = "Rc<Derivations>")]
mod derivation_builtins {
    use std::{path::PathBuf, rc::Rc};

    use snix_eval::{
        ErrorKind, NixAttrs, Value,
        generators::{Gen, GenCo},
    };

    use super::{Derivations, Recorded};

    /// Runs the derivation that outputs `path`, through its builder.
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
        let result = match state.builders.get(builder) {
            Some(run) => run(&inputs, &passthru),
            None => Err(format!("Unknown builder {builder:?}")),
        };

        let fields = match result {
            Ok(value) => [("type", Value::from("success")), ("value", value)],
            Err(error) => [
                ("type", Value::from("error")),
                ("error", Value::from(error)),
            ],
        };

        Ok(Value::attrs(NixAttrs::from_iter(fields)))
    }
}
