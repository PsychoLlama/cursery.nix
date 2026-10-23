# Running effects, and `io.map` chains of them from `<web/io>`. Rust steps
# through what handlers return (see `run` in `app.rs`).
#
# Effects describe something for Rust to do (see `effects.rs`), by `kind`,
# with `inputs`.

let
  isEffect = value: builtins.isAttrs value && value._type or null == "effect";
  isIo = value: builtins.isAttrs value && value._type or null == "io";

  # Checks what a handler returned: an effect, an `io.map` chain, or null.
  check =
    value:
    if value == null || isEffect value || isIo value then
      value
    else if builtins.isList value then
      throw "Invalid handler result of type list: return `io.all` to run several effects"
    else
      throw "Invalid handler result of type ${builtins.typeOf value}: expected an effect, like `io.dispatch` or `io.map`, or null";
in

{
  inherit isEffect isIo check;

  # Describes an effect. Inputs are forced with it, so a throw in them fails
  # the effect, rather than whatever reads its output.
  effect =
    kind: inputs:
    builtins.deepSeq [ kind inputs ] {
      _type = "effect";
      inherit kind inputs;
    };

  # What running `value` takes next:
  #
  # - `{ effect; }`: Rust runs the effect, deep-forced, then the output is
  #   the value.
  # - `{ source; next; }`: step through `source`, then call `next` with its
  #   output and step through the result. Failures skip `next`.
  # - `{ source; catch; }`: step through `source`. If it fails, call `catch`
  #   with `{ message; }` and step through the result. Successes skip it.
  # - `{ value; }`: nothing. `value` is the output.
  step =
    value:
    if isEffect value then
      builtins.deepSeq value { effect = value; }
    else if isIo value && value ? catch then
      { inherit (value) source catch; }
    else if isIo value then
      { inherit (value) source next; }
    else
      { inherit value; };
}
