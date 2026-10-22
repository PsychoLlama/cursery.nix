# Entry point for the renderer, which calls this with an app: the attrset
# from its `default.nix`. Every attribute is optional, but `init` and `update`
# come as a pair.
#
#   {
#     # Initial state. Without it, state is `{ }`.
#     init = { count = 0; };
#
#     # Returns the next state, given the current one and an action.
#     update = state: action: state;
#
#     # Returns children, like any element accepts.
#     render = state: html.p "Hello";
#   }

let
  children = import ./children.nix;

  check =
    app:
    if !builtins.isAttrs app then
      throw "Invalid app of type ${builtins.typeOf app}: expected an attrset"
    else if app ? init != app ? update then
      throw "Apps with `init` or `update` must define both"
    else if app ? update && !builtins.isFunction app.update then
      throw "Invalid `update` of type ${builtins.typeOf app.update}: expected a function"
    else if app ? render && !builtins.isFunction app.render then
      throw "Invalid `render` of type ${builtins.typeOf app.render}: expected a function"
    else
      app;
in

app:

let
  checked = check app;
  render = checked.render or (_: null);
in

{
  # Renders the app, given what the previous `mount` kept: `null` on the first
  # mount, then `{ state }` from apps with state. Reloads keep that state,
  # ignoring `init`, as long as the app still has state.
  mount =
    kept:
    let
      stateful = checked ? init;
      state =
        if !stateful then
          { }
        else if kept != null then
          kept.state
        else
          checked.init;
    in
    {
      children = children.normalize (render state);
      kept = if stateful then { inherit state; } else null;
    };
}
