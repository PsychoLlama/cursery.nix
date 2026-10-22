# Side effects, as derivations. Import one to run it now.
#
# `dispatch` describes dispatching an action to the app's `update`. Call it
# again to give the action a payload:
#
#   io.dispatch "increment"
#   io.dispatch "add" { text = "milk"; }
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
