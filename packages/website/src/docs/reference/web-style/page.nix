let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
    listing
    paragraph
    ;

  dom = html.a {
    class = link;
    href = "/docs/reference/web-dom/";
  } (code "<web/dom>");
in
import ../../article.nix "reference" "web-style" [
  (paragraph [
    "Scoped styles, and CSS images made of elements. Styles attach to elements through "
    (code "class")
    ", from "
    dom
    "."
  ])
  (listing "nix" "Exports" ''
    let
      inherit (import <web/style>) css image;
    in
    html.p { class = css "color: teal;"; } "Hello"
  '')

  (heading "css")
  (listing "nix" "Signature" ''
    css body
  '')
  (paragraph [
    "Returns a style: a class whose rule has "
    (code "body")
    ", a string of CSS. It's written as is, so selectors and at-rules nest in it with native CSS nesting:"
  ])
  (listing "nix" "Styles" ''
    card = css '''
      padding: 1rem;

      &:hover {
        background: var(--surface-hover);
      }

      @media (width < 40rem) {
        padding: 0.5rem;
      }
    ''';
  '')
  (paragraph [
    "The class is named "
    (code "s-")
    " and 8 hex digits of the SHA-256 of "
    (code "body")
    ", so identical CSS shares a class, and names stay the same across reloads. The rule is in "
    (code "@layer components")
    "."
  ])
  (paragraph "A style interpolates as its selector:")
  (listing "nix" "Selectors" ''
    icon = css "width: 1rem;";

    # The rule's body is `&:has(.s-4b172ce5) { padding-left: 2rem; }`.
    card = css "&:has(''${icon}) { padding-left: 2rem; }";
  '')
  (paragraph [
    "Styles load when an element using them renders, once per class. In the browser, they're adopted into the document, or the shadow root the app mounts in. Static renders return them as "
    (code "styles")
    "."
  ])
  (paragraph [
    "A body that isn't a string throws. In the browser, so does CSS that doesn't parse, or that closes the class's rule to style something else, as it loads. Static renders don't check it. Styles as children throw: they go in "
    (code "class")
    "."
  ])

  (heading "image")
  (listing "nix" "Signature" ''
    image children
  '')
  (paragraph [
    "Returns a CSS "
    (code "url()")
    " of an SVG data URL, serialized from "
    (code "children")
    ", like an "
    (code "svg")
    " element from "
    dom
    ":"
  ])
  (listing "nix" "Images" ''
    let
      inherit (import <web/dom>) svg;
      inherit (import <web/style>) css image;

      dot = svg.svg { viewBox = "0 0 10 10"; } (svg.circle { cx = 5; cy = 5; r = 5; });
    in
    css "list-style-image: ''${image dot};"
  '')
  (paragraph [
    "Root elements in the SVG namespace get its "
    (code "xmlns")
    ", unless they set one. Images are static: elements with handlers or styles throw, since nothing would run them, and the page's styles don't reach inside."
  ])
]
