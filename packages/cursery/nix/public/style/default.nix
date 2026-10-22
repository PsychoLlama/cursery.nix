# Scoped styles, like Vanilla Extract's `style`. `css` turns rules into a
# class, used through an element's `class` (see `<web/dom>`):
#
#   card = css {
#     padding = "1rem";
#     border-radius = "0.5rem";
#     display = [ "-webkit-box" "flex" ];
#     "&:hover".background = "var(--surface-hover)";
#     "@media (width < 40rem)".padding = "0.5rem";
#   };
#
#   html.div { class = [ card "shadow-md" ]; } "..."
#
# Attrsets are blocks: nested selectors and at-rules, written out as native
# CSS nesting. Anything else is a declaration: a string, a number (as is, no
# units), `null` to omit it, or a list of those to repeat it in order, e.g. for
# fallbacks.
#
# Nix sorts attributes, so declarations and blocks come out in alphabetical
# order, declarations first. Shorthands sort before their longhands
# (`margin`, `margin-top`), but selectors may not sort the way they should
# cascade: nest them (`"&:hover"."&:active"`) to raise specificity instead.
#
# Classes are named by a hash of their rules, so identical rules share a class
# and names survive reloads. Rules go in `@layer components`, so Tailwind's
# utilities override them.

let
  # Declaration values, in order. `null` omits one.
  values =
    property: value:
    builtins.concatMap (
      value:
      if value == null then
        [ ]
      else if builtins.isString value then
        [ value ]
      else if builtins.isInt value || builtins.isFloat value then
        [ (builtins.toJSON value) ]
      else
        throw "Invalid value for \"${property}\" of type ${builtins.typeOf value}: expected a string, number, null, or a list of those"
    ) (if builtins.isList value then value else [ value ]);

  # The contents of a block: its declarations, then its nested blocks.
  block =
    rules:
    let
      names = builtins.attrNames rules;
      isBlock = name: builtins.isAttrs rules.${name};

      declarations = builtins.concatMap (
        name: map (value: "${name}: ${value};") (values name rules.${name})
      ) (builtins.filter (name: !isBlock name) names);

      blocks = map (name: "${name} { ${block rules.${name}} }") (builtins.filter isBlock names);
    in
    builtins.concatStringsSep " " (declarations ++ blocks);

  css =
    rules:
    if !builtins.isAttrs rules then
      throw "Invalid rules of type ${builtins.typeOf rules}: expected an attrset"
    else
      let
        body = block rules;
        name = "s-${builtins.substring 0 8 (builtins.hashString "sha256" body)}";
      in
      {
        _type = "style";
        inherit name;
        css = "@layer components { .${name} { ${body} } }";
      };
in

{
  inherit css;
}
