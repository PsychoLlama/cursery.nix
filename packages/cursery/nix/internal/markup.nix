# Serializes nodes to markup, e.g. for SVG images in CSS (`image` from
# `<web/style>`). Roots in a namespace get its `xmlns`, which standalone
# documents need.
#
# Images are static: elements with handlers or styles are rejected, since
# nothing would run them, and the page's styles don't reach inside.

let
  inherit (import ./children.nix) normalize;

  escape = builtins.replaceStrings [ "&" "<" ">" "\"" ] [ "&amp;" "&lt;" "&gt;" "&quot;" ];

  attributes =
    attrs:
    builtins.concatStringsSep "" (
      map (name: if attrs.${name} == null then "" else " ${name}=\"${escape attrs.${name}}\"") (
        builtins.attrNames attrs
      )
    );

  node =
    value:
    if value._type == "text" then
      escape value.text
    else if builtins.any (handler: handler != null) (builtins.attrValues value.on) then
      throw "Invalid <${value.tag}> in markup: handlers can't run there"
    else if value.styles != { } then
      throw "Invalid <${value.tag}> in markup: styles don't apply there"
    else
      "<${value.tag}${attributes value.attrs}>${builtins.concatStringsSep "" (map node value.children)}</${value.tag}>";

  root =
    value:
    node (
      if value._type == "element" && value.namespace != null && !(value.attrs ? xmlns) then
        value
        // {
          attrs = value.attrs // {
            xmlns = value.namespace;
          };
        }
      else
        value
    );
in

{
  # Serializes children, as any element accepts them.
  markup = children: builtins.concatStringsSep "" (map root (normalize children));
}
