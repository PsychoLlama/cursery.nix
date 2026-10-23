# Side effects, as derivations. Import one to run it now.
#
# `dispatch` describes dispatching an action to the app's `update`. Call it
# again to give the action a payload:
#
#   io.dispatch "increment"
#   io.dispatch "add" { text = "milk"; }
#
# `update` gets `{ type; payload; }`, without `payload` if none was given.
# Return a dispatch from a handler to run it, or import it in a handler to
# run it now: it updates, renders, then returns the next state, or throws if
# it failed. Imports run when forced, so force the result in the handler:
# forced later, e.g. in `update`, it can't dispatch.
#
# Each dispatch hashes the current generation, so importing the same action
# again, e.g. twice in one handler, runs it again.
#
# Derivations override `type`, so the action's type is the `action` input.
# The payload goes in `passthru`, as is: it isn't hashed, so dispatches that
# differ only in their payload share an output path.
#
# `runCommand` runs JavaScript, like nixpkgs' `runCommand` runs a shell
# script. Assign the result to `$out`. Each attr of `env` is in scope as
# `$<name>`:
#
#   io.runCommand "double" { count = 3; } ''
#     $out = $count * 2;
#   ''
#
# Return it from a handler to run it, or import it in a handler to get
# `$out` back, as JSON would have it, or throw what the script threw. Scripts
# run synchronously, so `$out` can't be a promise.
#
# `env` goes in `passthru`, so it's passed as is rather than coerced. Like
# dispatches, commands hash the current generation, so each import runs.
#
# `map` sequences effects. It runs an effect, then calls a function with its
# output. If the function returns another effect, or another `map`, that
# runs next; any other value ends the chain:
#
#   io.map (count: io.dispatch "set" count) (io.runCommand "count" { } ''
#     $out = document.querySelectorAll("li").length;
#   '')
#
# Return it from a handler to run it. Each effect runs in turn, after the
# handler returns. If one fails, the rest of the chain doesn't run.

let
  inherit (import ../../internal/io/effects.nix) isEffect isIo;

  action =
    inputs:
    derivation (
      {
        name = "dispatch";
        builder = "builtin:dispatch";
        generation = builtins.__currentGeneration inputs;
      }
      // inputs
    );

  dispatch =
    type:
    if !builtins.isString type then
      throw "Invalid action type of type ${builtins.typeOf type}: expected a string"
    else
      action { action = type; }
      // {
        __functor =
          _: payload:
          action {
            action = type;
            passthru = { inherit payload; };
          };
      };

  runCommand =
    name: env: script:
    if !builtins.isAttrs env then
      throw "Invalid env of type ${builtins.typeOf env}: expected an attrset"
    else
      derivation {
        inherit name script;
        builder = "builtin:runCommand";
        generation = builtins.__currentGeneration env;
        passthru = { inherit env; };
      };

  map =
    next: source:
    if !builtins.isFunction next then
      throw "Invalid function of type ${builtins.typeOf next}: expected a function of the output"
    else if !isEffect source && !isIo source then
      throw "Invalid source of type ${builtins.typeOf source}: expected an effect, like `io.dispatch`, or another `io.map`"
    else
      {
        _type = "io";
        inherit source next;
      };
in

{
  inherit dispatch runCommand map;
}
