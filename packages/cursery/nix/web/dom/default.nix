# Builders for virtual DOM trees.
#
#   html.div { class = "card"; } [
#     (html.h1 "Title")
#     "some text"
#     (if loggedIn then html.p "Welcome back" else null)
#     html.hr
#   ]
#
# Elements are functors: applying one to attrs merges them in, and applying it
# to children appends them. Both are optional and can repeat.
#
# `class` takes strings, styles from `<web/style>`, `null`, or lists of those:
#
#   html.div { class = [ card "p-4" (if active then "ring" else null) ]; }
#
# Handlers in `on` take a snapshot of the event and return an effect, like
# `io.dispatch` from `<web/io>`, or `null` to ignore the event:
#
#   html.button { on.click = event: io.dispatch "increment"; } "+"
#
# Combine effects with `io.all` and friends to run several:
#
#   html.form { on.submit = event: io.all [ (event.preventDefault { }) (io.dispatch "save") ]; }
#
# Snapshots describe effects on the event too, run by importing them:
#
#   html.a { on.click = event: import (event.preventDefault { }); }
#
# `svg` has builders for SVG elements, rendered inline or, through `image`
# from `<web/style>`, as CSS images:
#
#   svg.svg { viewBox = "0 0 10 10"; } (svg.circle { cx = 5; cy = 5; r = 5; })
#
# Builders normalize children as they go (see `internal/children.nix`).

let
  inherit (import ../../internal/children.nix) text normalize;

  # Attrsets that aren't nodes are attrs. Nodes are children.
  isAttrs = value: builtins.isAttrs value && !(value ? _type);

  # Converts an attribute value to the string the renderer sets, the way HTML
  # does. `true` sets an empty attribute (`disabled`), and `false` or `null`
  # become `null`, which the renderer omits. They stay in attrs so they can
  # override an earlier value.
  attribute =
    name: value:
    if value == null || value == false then
      null
    else if value == true then
      ""
    else if builtins.isString value then
      value
    else if builtins.isInt value || builtins.isFloat value then
      builtins.toJSON value
    else
      throw "Invalid attribute \"${name}\" of type ${builtins.typeOf value}: expected a string, number, boolean, or null";

  # Event handlers take an event and return an effect, or `null` to ignore
  # it. A `null` handler overrides an earlier one, like attributes.
  handler =
    name: value:
    if builtins.isFunction value || value == null then
      value
    else
      throw "Invalid handler \"on.${name}\" of type ${builtins.typeOf value}: expected a function or null";

  handlers =
    on:
    if builtins.isAttrs on then
      builtins.mapAttrs handler on
    else
      throw "Invalid `on` of type ${builtins.typeOf on}: expected an attrset of handlers";

  isStyle = value: builtins.isAttrs value && value._type or null == "style";

  # Flattens a `class` into strings and styles.
  classes =
    value:
    if builtins.isList value then
      builtins.concatMap classes value
    else if value == null then
      [ ]
    else if builtins.isString value || isStyle value then
      [ value ]
    else
      throw "Invalid class of type ${builtins.typeOf value}: expected a string, style, null, or a list of those";

  # The `class` attribute, or `null` to omit it if there are no classes.
  className =
    list:
    if list == [ ] then
      null
    else
      builtins.concatStringsSep " " (map (class: if isStyle class then class.name else class) list);

  # CSS for the renderer to load, by class name.
  styles =
    list:
    builtins.listToAttrs (
      map (style: {
        inherit (style) name;
        value = style.css;
      }) (builtins.filter isStyle list)
    );

  # Keys identify an element among its siblings, so it's patched rather than
  # recreated when siblings come and go or reorder. Integers become strings,
  # so `1` and `"1"` are the same key.
  key =
    value:
    if value == null || builtins.isString value then
      value
    else if builtins.isInt value then
      toString value
    else
      throw "Invalid key of type ${builtins.typeOf value}: expected a string, integer, or null";

  # Applies attrs or children to an element, returning a new element. `key` is
  # lifted out of attrs to identify the node among its siblings when diffing,
  # `on` to hold event handlers, and the CSS of styles in `class`.
  apply =
    self: arg:
    if isAttrs arg then
      let
        list = classes arg.class;
      in
      self
      // {
        key = if arg ? key then key arg.key else self.key;
        on = self.on // handlers (arg.on or { });
        styles = if arg ? class then styles list else self.styles;
        attrs =
          self.attrs
          // builtins.mapAttrs attribute (
            builtins.removeAttrs arg [
              "key"
              "on"
              "class"
            ]
          )
          // (if arg ? class then { class = className list; } else { });
      }
    else
      self // { children = self.children ++ normalize arg; };

  # Creates an element in `namespace` (`null` for HTML), with no attrs or
  # children.
  elementIn = namespace: tag: {
    _type = "element";
    inherit namespace tag;
    key = null;
    on = { };
    styles = { };
    attrs = { };
    children = [ ];
    __functor = apply;
  };

  element = elementIn null;

  # A builder per tag, by tag.
  builders =
    namespace: tags:
    builtins.listToAttrs (
      map (tag: {
        name = tag;
        value = elementIn namespace tag;
      }) tags
    );

  # https://html.spec.whatwg.org/multipage/indices.html#elements-3
  htmlTags = [
    "a"
    "abbr"
    "address"
    "area"
    "article"
    "aside"
    "audio"
    "b"
    "base"
    "bdi"
    "bdo"
    "blockquote"
    "body"
    "br"
    "button"
    "canvas"
    "caption"
    "cite"
    "code"
    "col"
    "colgroup"
    "data"
    "datalist"
    "dd"
    "del"
    "details"
    "dfn"
    "dialog"
    "div"
    "dl"
    "dt"
    "em"
    "embed"
    "fieldset"
    "figcaption"
    "figure"
    "footer"
    "form"
    "h1"
    "h2"
    "h3"
    "h4"
    "h5"
    "h6"
    "head"
    "header"
    "hgroup"
    "hr"
    "html"
    "i"
    "iframe"
    "img"
    "input"
    "ins"
    "kbd"
    "label"
    "legend"
    "li"
    "link"
    "main"
    "map"
    "mark"
    "menu"
    "meta"
    "meter"
    "nav"
    "noscript"
    "object"
    "ol"
    "optgroup"
    "option"
    "output"
    "p"
    "picture"
    "pre"
    "progress"
    "q"
    "rp"
    "rt"
    "ruby"
    "s"
    "samp"
    "script"
    "search"
    "section"
    "select"
    "slot"
    "small"
    "source"
    "span"
    "strong"
    "style"
    "sub"
    "summary"
    "sup"
    "table"
    "tbody"
    "td"
    "template"
    "textarea"
    "tfoot"
    "th"
    "thead"
    "time"
    "title"
    "tr"
    "track"
    "u"
    "ul"
    "var"
    "video"
    "wbr"
  ];

  # https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element
  svgTags = [
    "a"
    "animate"
    "animateMotion"
    "animateTransform"
    "circle"
    "clipPath"
    "defs"
    "desc"
    "ellipse"
    "feBlend"
    "feColorMatrix"
    "feComponentTransfer"
    "feComposite"
    "feConvolveMatrix"
    "feDiffuseLighting"
    "feDisplacementMap"
    "feDistantLight"
    "feDropShadow"
    "feFlood"
    "feFuncA"
    "feFuncB"
    "feFuncG"
    "feFuncR"
    "feGaussianBlur"
    "feImage"
    "feMerge"
    "feMergeNode"
    "feMorphology"
    "feOffset"
    "fePointLight"
    "feSpecularLighting"
    "feSpotLight"
    "feTile"
    "feTurbulence"
    "filter"
    "foreignObject"
    "g"
    "image"
    "line"
    "linearGradient"
    "marker"
    "mask"
    "metadata"
    "mpath"
    "path"
    "pattern"
    "polygon"
    "polyline"
    "radialGradient"
    "rect"
    "script"
    "set"
    "stop"
    "style"
    "svg"
    "switch"
    "symbol"
    "text"
    "textPath"
    "title"
    "tspan"
    "use"
    "view"
  ];
in

{
  inherit element text;

  # A builder per HTML element, e.g. `html.div attrs children`.
  html = builders null htmlTags;

  # A builder per SVG element, e.g. `svg.circle { r = 5; }`. Separate from
  # `html`, since some tags are in both (`a`, `title`).
  svg = builders "http://www.w3.org/2000/svg" svgTags;
}
