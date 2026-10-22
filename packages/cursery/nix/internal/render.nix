# Entry point for the renderer, which calls this with an app: the attrset
# from its `default.nix`. Every attribute is optional.
#
#   {
#     # Returns children, like any element accepts.
#     render = state: html.p "Hello";
#   }
#
# Returns a view: a function from state to normalized children. The renderer
# keeps it, so the app is evaluated once rather than on every render.

let
  children = import ./children.nix;
in

app: state: children.normalize ((app.render or (_: null)) state)
