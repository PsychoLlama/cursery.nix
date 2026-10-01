set indentation := "  "
set default-list
set quiet

mod cargo 'just/cargo.just'

# Format the tree.
fmt:
  treefmt

# Verify the tree is formatted. CI sets `TREEFMT_CI` to bypass the cache.
fmt-check:
  treefmt --quiet --fail-on-change

# Everything a change must pass.
check: fmt-check cargo::lint cargo::build cargo::build-wasm cargo::test
