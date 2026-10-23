# Side effects. Return them from handlers to run them. `dispatch` is still a
# derivation, which can also be imported to run it now.
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
# Return it from a handler to run it. Its output is `$out`, as JSON would
# have it. Scripts run synchronously, so `$out` can't be a promise. Errors
# name the command.
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
# handler returns. Failures don't stop the chain: the function gets an
# output that throws the failure when forced. Recover with
# `builtins.tryEval`, or ignore the output to carry on regardless:
#
#   io.map (output: if (builtins.tryEval output).success then null else io.dispatch "failed")
#     (io.runCommand "risky" { } "$out = risky()")
#
# The value a chain ends with is forced, so a failure that reaches it is
# reported. So are failures nothing forced by the time the chain ends.
#
# `pipe` threads a value through functions, each getting what the last one
# returned. When one returns an effect, the next gets its output, once it
# runs:
#
#   io.pipe "milk" [
#     (text: io.dispatch "add" text)
#     (state: io.runCommand "log" { inherit state; } "console.log($state)")
#   ]
#
# It returns an effect to run if any function returned one, or else the last
# function's value.
#
# `all` runs effects in order, then outputs a list of their outputs, even if
# some fail: failed outputs throw when forced. Other values in the list are
# outputs already:
#
#   io.map (counts: io.dispatch "counted" counts) (io.all [
#     (io.runCommand "items" { } "$out = document.querySelectorAll('li').length")
#     (io.runCommand "links" { } "$out = document.links.length")
#   ])

let
  inherit (import ../../internal/io/effects.nix) effect isEffect isIo;

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
    if !builtins.isString name then
      throw "Invalid command name of type ${builtins.typeOf name}: expected a string"
    else if !builtins.isAttrs env then
      throw "Invalid env of type ${builtins.typeOf env}: expected an attrset"
    else if !builtins.isString script then
      throw "Invalid script of type ${builtins.typeOf script}: expected a string"
    else
      effect "runCommand" { inherit name env script; };

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

  # Calls `next` with `value`, or with its output if it's an effect.
  chain = next: value: if isEffect value || isIo value then map next value else next value;

  pipe =
    init: functions:
    if !builtins.isList functions then
      throw "Invalid functions of type ${builtins.typeOf functions}: expected a list"
    else
      builtins.foldl' (
        value: next:
        if !builtins.isFunction next then
          throw "Invalid function of type ${builtins.typeOf next}: expected a function of the output"
        else
          chain next value
      ) init functions;

  all =
    effects:
    if !builtins.isList effects then
      throw "Invalid effects of type ${builtins.typeOf effects}: expected a list"
    else
      builtins.foldl' (
        outputs: effect: chain (done: chain (output: done ++ [ output ]) effect) outputs
      ) [ ] effects;
in

{
  inherit
    dispatch
    runCommand
    map
    pipe
    all
    ;
}
