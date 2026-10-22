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

  # Calls an event handler, returning what to keep after its action, or
  # `null` if it ignored the event.
  handle =
    kept: handler: snapshot:
    let
      action = handler (event snapshot);
    in
    if action == null then
      null
    else if kept == null then
      throw "Received an action without an `update` to handle it"
    else
      { state = checked.update kept.state action; };

  # Renders children from what `mount` or `handle` kept.
  inherit view;
}
