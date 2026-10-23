# Side effects. Return them from handlers to run them.
#
# `dispatch` describes dispatching an action to the app's `update`, given
# its type and payload. Pass `null` for no payload:
#
#   io.dispatch "increment" null
#   io.dispatch "add" { text = "milk"; }
#
# `update` gets `{ type; payload; }`. Return a dispatch from a handler to run it: it updates, renders, then
# outputs the next state. The payload is forced with it, so a throw in it
# fails the dispatch.
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
# handler returns. If an effect or function fails, the chain skips ahead to
# the nearest `catch`, and failures nothing catches are reported. Values a
# chain passes on are forced, so a throw in one fails where it happens.
#
# `catch` handles failures, like a promise's `catch`. Its handler gets
# `{ message; }` and returns a value, an effect or a chain, and the chain
# carries on from there. Successes pass through untouched:
#
#   io.catch (error: io.dispatch "failed" error.message)
#     (io.runCommand "risky" { } "$out = risky()")
#
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
# `io.catch handler` is a step too, handling failures of every step before
# it. Steps after it get its result:
#
#   io.pipe null [
#     (_: io.runCommand "read" { } "$out = Number(localStorage.count)")
#     (io.catch (error: 0))
#     (count: io.dispatch "set" count)
#   ]
#
# `all` runs effects in order, then outputs a list of their outputs. It stops
# at the first failure. Other values in the list are outputs already:
#
#   io.map (counts: io.dispatch "counted" counts) (io.all [
#     (io.runCommand "items" { } "$out = document.querySelectorAll('li').length")
#     (io.runCommand "links" { } "$out = document.links.length")
#   ])

let
  inherit (import ../../internal/io/effects.nix) effect isEffect isIo;

  dispatch =
    type:
    if !builtins.isString type then
      throw "Invalid action type of type ${builtins.typeOf type}: expected a string"
    else
      payload: effect "dispatch" { inherit type payload; };

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

  isCatch = value: builtins.isAttrs value && value._type or null == "catch";

  # Applied to a source, `catch handler` makes a chain. Applied to nothing,
  # it's a step for `pipe`.
  catch =
    handler:
    if !builtins.isFunction handler then
      throw "Invalid handler of type ${builtins.typeOf handler}: expected a function of the error"
    else
      {
        _type = "catch";
        __functor =
          _: source:
          if !isEffect source && !isIo source then
            throw "Invalid source of type ${builtins.typeOf source}: expected an effect, like `io.dispatch`, or an `io` chain"
          else
            {
              _type = "io";
              inherit source;
              catch = handler;
            };
      };

  pipe =
    init: functions:
    if !builtins.isList functions then
      throw "Invalid functions of type ${builtins.typeOf functions}: expected a list"
    else
      builtins.foldl' (
        value: next:
        if isCatch next then
          # Values that aren't effects can't fail.
          if isEffect value || isIo value then next value else value
        else if !builtins.isFunction next then
          throw "Invalid function of type ${builtins.typeOf next}: expected a function of the output, or `io.catch`"
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
    catch
    pipe
    all
    ;
}
