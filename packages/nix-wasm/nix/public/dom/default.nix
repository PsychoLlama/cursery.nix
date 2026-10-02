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
# Builders normalize as they go, so every node is one of two shapes:
#
#   { _type = "element"; tag; key; attrs; children; }
#   { _type = "text"; text; }
#
# Those shapes are the contract with the renderer. The root element also
# carries `__functor`, which renderers should ignore.

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

  # Flattens children (like React's `ReactNode`) into a list of nodes:
  # - Lists are flattened, however deeply nested.
  # - `null` and booleans render nothing, for conditional rendering.
  # - Strings and numbers become text nodes.
  normalizeChildren =
    children:
    if builtins.isList children then
      builtins.concatMap normalizeChildren children
    else if children == null || builtins.isBool children then
      [ ]
    else if builtins.isString children then
      [ (text children) ]
    else if builtins.isInt children || builtins.isFloat children then
      [ (text (builtins.toJSON children)) ]
    else if isNode children then
      # TODO: Stop stripping the functor. It only exists so tests can use
      # `builtins.toJSON`; future tests will exercise rendered behavior.
      [ (builtins.removeAttrs children [ "__functor" ]) ]
    else
      throw "Invalid child of type ${builtins.typeOf children}: expected an element, string, number, null, boolean, or a list of those";

  # Attrsets that aren't nodes are attrs. Nodes are children.
  isAttrs = value: builtins.isAttrs value && !(value ? _type);

  # Applies attrs or children to an element, returning a new element. `key` is
  # lifted out of attrs to identify the node among its siblings when diffing.
  apply =
    self: arg:
    if isAttrs arg then
      self
      // {
        key = arg.key or self.key;
        attrs = self.attrs // builtins.removeAttrs arg [ "key" ];
      }
    else
      self // { children = self.children ++ normalizeChildren arg; };

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
