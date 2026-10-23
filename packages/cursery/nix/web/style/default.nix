# Scoped styles, like Vanilla Extract's `style`. `css` turns CSS into a
# class, used through an element's `class` (see `<web/dom>`):
#
#   card = css ''
#     padding: 1rem;
#     border-radius: 0.5rem;
#
#     &:hover {
#       background: var(--surface-hover);
#     }
#
#     @media (width < 40rem) {
#       padding: 0.5rem;
#     }
#   '';
#
#   html.div { class = [ card "shadow-md" ]; } "..."
#
# The CSS is the body of the class's rule, written as is: nest selectors and
# at-rules in it with native CSS nesting. It can't close the rule to style
# anything else.
#
# Styles interpolate as their selector, e.g. to style a card by its icon:
#
#   card = css ''
#     &:has(${icon}) { padding-left: 2rem; }
#   '';
#
# Classes are named by a hash of their CSS, so identical CSS shares a class
# and names survive reloads. Rules go in `@layer components`, so Tailwind's
# utilities override them.
#
# `image` turns nodes, like an SVG from `<web/dom>`, into a CSS image:
#
#   check = svg.svg { viewBox = "0 0 100 100"; } (svg.path { d = "..."; });
#   css "background-image: ${image check};"

let
  inherit (import ../../internal/markup.nix) markup;

  # Percent-encodes what data URLs and CSS strings can't hold as is.
  encode =
    builtins.replaceStrings
      [ "%" "#" "<" ">" "\"" "\n" ]
      [ "%25" "%23" "%3C" "%3E" "%22" "%0A" ];

  image = children: "url(\"data:image/svg+xml,${encode (markup children)}\")";

  css =
    body:
    if !builtins.isString body then
      throw "Invalid CSS of type ${builtins.typeOf body}: expected a string"
    else
      let
        name = "s-${builtins.substring 0 8 (builtins.hashString "sha256" body)}";
      in
      {
        _type = "style";
        inherit name;
        css = "@layer components { .${name} { ${body} } }";
        __toString = style: ".${style.name}";
      };
in

{
  inherit css image;
}
