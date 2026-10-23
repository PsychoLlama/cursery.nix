# Running effects: derivations (see `derivations.rs`), and `io.map` chains of
# them from `<web/io>`. Rust steps through what handlers return (see `run` in
# `app.rs`).

let
  isEffect = value: builtins.isAttrs value && value.type or null == "derivation";
  isIo = value: builtins.isAttrs value && value._type or null == "io";

  # Flattens what a handler returned into a list of effects.
  flatten =
    value:
    if builtins.isList value then
      builtins.concatMap flatten value
    else if value == null then
      [ ]
    else if isEffect value || isIo value then
      [ value ]
    else
      throw "Invalid handler result of type ${builtins.typeOf value}: expected an effect, like `io.dispatch` or `io.map`, null, or a list of those";
in

{
  inherit isEffect isIo flatten;

  # What running `value` takes next:
  #
  # - `{ effect; }`: `run` the effect's output path, then the output is the
  #   value.
  # - `{ source; next; }`: step through `source`, then call `next` with its
  #   output and step through the result.
  # - `{ value; }`: nothing. `value` is the output.
  step =
    value:
    if isEffect value then
      { effect = value.outPath; }
    else if isIo value then
      { inherit (value) source next; }
    else
      { inherit value; };

  # Runs an effect, given its output path, returning its output. A failed
  # effect throws.
  run = path: import path;

  # A failure passed on to the next function in a chain, which gets it
  # imported. Forcing it marks it handled, then throws `message` (see
  # `failures.rs`).
  failure =
    id: message:
    derivation {
      name = "failure";
      builder = "builtin:fail";
      inherit id message;
    };
}
