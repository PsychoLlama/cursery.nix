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

  # Applies attrs or children to an element, returning a new element. `key` is
  # lifted out of attrs to identify the node among its siblings when diffing.
  apply =
    self: arg:
    if isAttrs arg then
      self
      // {
        key = arg.key or self.key;
        attrs = self.attrs // builtins.mapAttrs attribute (builtins.removeAttrs arg [ "key" ]);
      }
    else
      self // { children = self.children ++ normalize arg; };

  # Creates an element with no attrs or children.
  element = tag: {
    _type = "element";
    inherit tag;
    key = null;
    attrs = { };
    children = [ ];
    __functor = apply;
  };

  # https://html.spec.whatwg.org/multipage/indices.html#elements-3
  tags = [
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
in

{
  inherit element text;

  # A builder per HTML element, e.g. `html.div attrs children`.
  html = builtins.listToAttrs (
    map (tag: {
      name = tag;
      value = element tag;
    }) tags
  );
}
