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
# it failed. Imports run when forced, so force the result in the handler: forced later, e.g. in `update`, it can't dispatch.
#
# Each dispatch hashes the current generation, so importing the same action
# again, e.g. twice in one handler, runs it again.
#
# Derivations override `type`, so the action's type is the `action` input.
# The payload goes in `passthru`, as is: it isn't hashed, so dispatches that
# differ only in their payload share an output path.

let
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
in

{
  inherit dispatch;
}
