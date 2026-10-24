# Entry point for the renderer, which calls this with an app: the attrset
# from its `default.nix`. Every attribute is optional, but `init` and `update`
# come as a pair.
#
#   {
#     # Initial state. Without it, state is `{ }`.
#     init = { count = 0; };
#
#     # Returns the next state, given the current one and an action
#     # dispatched with `io.dispatch` from `<web/io>`: `{ type; payload; }`.
#     # Or returns an effect to run instead, leaving the state as it is.
#     update = state: action: state;
#
#     # Returns children, like any element accepts.
#     render = state: html.p "Hello";
#
#     # Global CSS. It goes in `@layer base`, with Tailwind's preflight, so
#     # utilities override it.
#     styles = ''
#       body { margin: 0; }
#       :root { --accent: tan; }
#     '';
#   }

let
  children = import ./children.nix;
  effects = import ./io/effects.nix;
  event = import ./io/event.nix;

  check =
    app:
    if !builtins.isAttrs app then
      throw "Invalid app of type ${builtins.typeOf app}: expected an attrset"
    else if app ? init != app ? update then
      throw "Apps with `init` or `update` must define both"
    else if app ? update && !builtins.isFunction app.update then
      throw "Invalid `update` of type ${builtins.typeOf app.update}: expected a function"
    else if app ? styles && !builtins.isString app.styles then
      throw "Invalid `styles` of type ${builtins.typeOf app.styles}: expected a string of CSS"
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

# Checks the app up front. snix's `or` falls back on errors, so
# `checked.render or ...` alone would hide an invalid app.
builtins.seq checked {
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
      styles = if checked.styles or "" == "" then null else "@layer base { ${checked.styles} }";
    };

  # Calls an event handler. It returns an effect to run, like `io.dispatch`
  # or `io.map`, or `null` to ignore the event. Returns the effect, for Rust
  # to run (see `io/effects.nix`).
  handle = handler: snapshot: effects.check (handler (event snapshot));

  # Applies an action to what `mount` or `update` kept, for `dispatch`
  # effects. Returns `{ kept; }` for the next state, or `{ effect; }` if
  # `update` returned an effect to run instead.
  update =
    kept: action:
    let
      next = checked.update kept.state action;
    in
    if kept == null then
      throw "Received an action without an `update` to handle it"
    else if effects.isEffect next || effects.isIo next then
      { effect = next; }
    else
      { kept.state = next; };

  # Renders children from what `mount` or `update` kept.
  inherit view;
}
