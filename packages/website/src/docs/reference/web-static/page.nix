let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
    listing
    paragraph
    ;
in

import ../../article.nix "reference" "web-static" [
  (paragraph [
    "Renders apps ahead of time, for pages built at build time or on a server. The Vite plugin uses it to fill a server entry's "
    (code "children")
    " and "
    (code "assets")
    "."
  ])

  (listing "nix" "Exports" ''
    let
      inherit (import <web/static>) render;
    in

    render (import ./app)
  '')

  (heading "render")

  (listing "nix" "Signature" ''
    render app
  '')

  (paragraph [
    "Renders "
    (code "app")
    " as it first mounts: its "
    (code "render")
    " given "
    (code "init")
    ", or "
    (code "{ }")
    " if it has no state. Returns:"
  ])

  (html.ul { class = "mt-4 list-disc space-y-2 pl-6"; } [
    (html.li [
      (code "children")
      ": the rendered nodes, normalized as "
      (html.a {
        class = link;
        href = "/docs/reference/web-dom/";
      } (code "<web/dom>"))
      " children are."
    ])

    (html.li [
      (code "styles")
      ": the CSS the nodes need, as a string. The app's global "
      (code "styles")
      " come first, in "
      (code "@layer base")
      ", then each class in "
      (code "children")
      " once, in tree order, in "
      (code "@layer components")
      "."
    ])
  ])

  (listing "nix" "src/page.nix" ''
    { ... }:

    let
      inherit (import <web/dom>) html;
      inherit (import <web/static>) render;
      app = render (import ./app);
    in

    html.html { lang = "en"; } [
      (html.head (html.style app.styles))
      (html.body (html.div { id = "app"; } app.children))
    ]
  '')

  (paragraph [
    "Event handlers have nothing to run them, so they're left out of the HTML. Mounting the app into the container replaces what was rendered."
  ])

  (paragraph "Different styles that hash to the same class name throw.")
]
