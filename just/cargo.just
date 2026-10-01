set indentation := "  "
set default-list
set quiet

# Compile the crate.
build *args:
  cargo build --quiet {{ args }}

# Run the test suite. Note that nextest cannot run doctests.
# TODO: Drop `--no-tests=warn` once the crate has tests.
test *args:
  cargo nextest run --all-features --cargo-quiet --no-tests=warn {{ args }}

# Lint with clippy, enforcing the `[lints.clippy]` policy `cargo build` skips.
lint *args:
  cargo clippy --quiet --all-targets --all-features {{ args }}

# Compile for the browser.
build-wasm *args:
  cargo build --quiet --target wasm32-unknown-unknown {{ args }}
