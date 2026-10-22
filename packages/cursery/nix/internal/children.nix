# Normalizes children (like React's `ReactNode`) into a list of nodes, the
# shapes the renderer understands:
#
#   { _type = "element"; namespace; tag; key; on; styles; attrs; children; }
#   { _type = "text"; text; }
#
# `namespace` is `null` for HTML elements. Attribute values are strings, or
# `null` to omit them. Handlers in `on` are functions, or `null` for none.
# `styles` maps class names to the CSS that defines them.
#
# - Lists are flattened, however deeply nested.
# - `null` and booleans render nothing, for conditional rendering.
# - Strings and numbers become text nodes.

let
  # Wraps a string in a text node.
  text = value: {
    _type = "text";
    text = value;
  };

  isNode =
    value:
    builtins.isAttrs value
    && builtins.elem (value._type or null) [
      "element"
      "text"
    ];

  normalize =
    children:
    if builtins.isList children then
      builtins.concatMap normalize children
    else if children == null || builtins.isBool children then
      [ ]
    else if builtins.isString children then
      [ (text children) ]
    else if builtins.isInt children || builtins.isFloat children then
      [ (text (builtins.toJSON children)) ]
    else if isNode children then
      [ children ]
    else if children._type or null == "style" then
      throw "Invalid child: styles go in `class`"
    else
      throw "Invalid child of type ${builtins.typeOf children}: expected an element, string, number, null, boolean, or a list of those";
in

{
  inherit text normalize;
}
