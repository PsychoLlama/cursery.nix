//! Builtins that read the in-memory filesystem. snix only offers them among
//! its impure builtins, which don't build for wasm, and which also read the
//! clock and environment. Reading loaded files keeps evaluation pure.

use snix_eval::builtin_macros::builtins;

#[expect(
    unused_qualifications,
    reason = "the macro qualifies paths that are already in scope"
)]
#[builtins]
mod file_builtins {
    use std::io::Read;

    use snix_eval::{
        ErrorKind, Value,
        builtins::coerce_value_to_path,
        generators::{self, Gen, GenCo},
        try_cek_to_value,
    };

    #[builtin("readFile")]
    async fn builtin_read_file(co: GenCo, path: Value) -> Result<Value, ErrorKind> {
        let path = try_cek_to_value!(coerce_value_to_path(&co, path).await?);
        let mut buf = Vec::new();
        generators::request_open_file(&co, path)
            .await
            .read_to_end(&mut buf)?;
        Ok(Value::from(buf))
    }
}

pub(crate) use file_builtins::builtins;
