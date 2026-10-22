# Gives an event snapshot from Rust its effects, closing over its `__id` and
# hiding it. Effects are derivations (see `derivations.rs`).

snapshot:

builtins.removeAttrs snapshot [ "__id" ]
// {
  preventDefault =
    { }:
    derivation {
      name = "preventDefault";
      builder = "builtin:preventDefault";
      event = snapshot.__id;
    };
}
