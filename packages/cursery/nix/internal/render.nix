# Entry point for the renderer, which calls this with an app: the attrset
# from its `default.nix`. Every attribute is optional.
#
#   {
#     # Returns children, like any element accepts.
#     render = state: html.p "Hello";
#   }

let
  children = import ./children.nix;
in

app: children.normalize ((app.render or (_: null)) { })
