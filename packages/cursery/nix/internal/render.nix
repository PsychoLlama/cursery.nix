# Entry point for the renderer, which calls this with an app: the attrset
# from its `default.nix`. Every attribute is optional, but `init` and `update`
# come as a pair.
#
#   {
#     # Initial state. Without it, state is `{ }`.
#     init = { count = 0; };
#
#     # Returns the next state, given the current one and an action
#     # dispatched with `io.dispatch` from `<web/io>`:
#     # `{ type; payload; }`, without `payload` if none was given.
#     update = state: action: state;
#
#     # Returns children, like any element accepts.
#     render = state: html.p "Hello";
#
#     # Rules for selectors, as `css` from `<web/style>` takes them. They go
#     # in `@layer base`, with Tailwind's preflight, so utilities override
#     # them.
#     styles = {
#       body.margin = 0;
#       ":root"."--accent" = "tan";
#     };
#   }

let
  children = import ./children.nix;
  css = import ./css.nix;
  event = import ./io/event.nix;

  check =
    app:
    if !builtins.isAttrs app then
      throw "Invalid app of type ${builtins.typeOf app}: expected an attrset"
    else if app ? init != app ? update then
      throw "Apps with `init` or `update` must define both"
    else if app ? update && !builtins.isFunction app.update then
      throw "Invalid `update` of type ${builtins.typeOf app.update}: expected a function"
    else if app ? styles && !builtins.isAttrs app.styles then
      throw "Invalid `styles` of type ${builtins.typeOf app.styles}: expected an attrset of selectors"
    else if app ? render && !builtins.isFunction app.render then
      throw "Invalid `render` of type ${builtins.typeOf app.render}: expected a function"
    else
      app;
in

app:

let
  checked = check app;
  render = checked.render or (_: null);
  view = kept: children.normalize (render (if kept == null then { } else kept.state));
in

{
  # Renders the app, given what the previous `mount` kept: `null` on the first
  # mount, then `{ state }` from apps with state. Reloads keep that state,
  # ignoring `init`, as long as the app still has state. `styles` is the CSS
  # of its global styles, or `null` for none.
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

      next = if stateful then { inherit state; } else null;
    in
    {
      children = view next;
      kept = next;
      styles =
        if checked.styles or { } == { } then null else "@layer base { ${css.global checked.styles} }";
    };

  # Calls an event handler. It returns an effect to run, like `io.dispatch`,
  # or `null` to ignore the event. A failed effect throws its error.
  handle =
    handler: snapshot:
    let
      effect = handler (event snapshot);
      result = import effect;
    in
    if effect == null then
      null
    else if !(builtins.isAttrs effect && effect.type or null == "derivation") then
      throw "Invalid handler result of type ${builtins.typeOf effect}: expected an effect, like `io.dispatch`, or null"
    else if result.type == "error" then
      throw result.error
    else
      null;

  # Applies an action to what `mount` or `update` kept, for
  # `builtin:dispatch`.
  update =
    kept: action:
    if kept == null then
      throw "Received an action without an `update` to handle it"
    else
      { state = checked.update kept.state action; };

  # Renders children from what `mount` or `update` kept.
  inherit view;
}
