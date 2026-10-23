# Server renders, for `renderToString`. `render` renders an app as it first
# mounts, for a page to place:
#
#   { client, bundles, ... }:
#   let
#     inherit (import <web/dom>) html;
#     inherit (import <web/server>) render;
#     app = render (import client);
#   in
#   html.html { lang = "en"; } [
#     (html.head ([ (html.style app.styles) ]
#       ++ map (src: html.script { type = "module"; inherit src; }) bundles))
#     (html.body (html.div { id = "app"; } app.children))
#   ]
#
# `children` is what `render` returns given `init`, normalized. `styles` is
# the CSS it needs: the app's global `styles`, then the classes of styles in
# `children`, in tree order.
#
# Mounting the app into that container replaces what the server rendered.

let
  renderer = import ../../internal/render.nix;

  # Styles in `children` as `{ name; value; }` pairs, in tree order.
  classes =
    children:
    builtins.concatMap (
      node:
      if node._type != "element" then
        [ ]
      else
        map (name: {
          inherit name;
          value = node.styles.${name};
        }) (builtins.attrNames node.styles)
        ++ classes node.children
    ) children;

  # The CSS of each class once, first seen first.
  unique =
    styles:
    (builtins.foldl'
      (
        result: style:
        if !(result.seen ? ${style.name}) then
          {
            seen = result.seen // {
              ${style.name} = style.value;
            };
            css = result.css ++ [ style.value ];
          }
        else if result.seen.${style.name} == style.value then
          result
        else
          throw "Different styles hash to the same class name \"${style.name}\""
      )
      {
        seen = { };
        css = [ ];
      }
      styles
    ).css;

  render =
    app:
    let
      mounted = (renderer app).mount null;
      globals = if mounted.styles == null then [ ] else [ mounted.styles ];
    in
    {
      inherit (mounted) children;
      styles = builtins.concatStringsSep "\n" (globals ++ unique (classes mounted.children));
    };
in

{
  inherit render;
}
