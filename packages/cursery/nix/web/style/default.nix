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
# CSS nesting. Lists of attrsets repeat a block. Anything else is a
# declaration: a string, a number (as is, no units), `null` to omit it, or a
# list of those to repeat it in order, e.g. for fallbacks.
#
# Nix sorts attributes, so declarations and blocks come out in alphabetical
# order, declarations first. Shorthands sort before their longhands
# (`margin`, `margin-top`), but selectors may not sort the way they should
# cascade: nest them (`"&:hover"."&:active"`) to raise specificity instead.
#
# Classes are named by a hash of their rules, so identical rules share a class
# and names survive reloads. Rules go in `@layer components`, so Tailwind's
# utilities override them.
#
# `image` turns nodes, like an SVG from `<web/dom>`, into a CSS image:
#
#   check = svg.svg { viewBox = "0 0 100 100"; } (svg.path { d = "..."; });
#   css { background-image = image check; }

let
  inherit (import ../../internal/css.nix) block;
  inherit (import ../../internal/markup.nix) markup;

  # Percent-encodes what data URLs and CSS strings can't hold as is.
  encode =
    builtins.replaceStrings
      [ "%" "#" "<" ">" "\"" "\n" ]
      [ "%25" "%23" "%3C" "%3E" "%22" "%0A" ];

  image = children: "url(\"data:image/svg+xml,${encode (markup children)}\")";

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
  inherit css image;
}
