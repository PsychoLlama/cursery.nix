let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    listing
    paragraph
    ;
in

import ../../article.nix "guides" "pre-rendering" [
  (paragraph [
    (code "renderToString")
    " evaluates a Nix page and returns its HTML as a string. This guide renders one from Node."
  ])

  (heading "Write the page")

  (paragraph [
    "A page is a function of its inputs that returns an "
    (code "html")
    " element."
  ])

  (listing "nix" "src/page.nix" ''
    { name }:

    let
      inherit (import <web/dom>) html;
      inherit (import <web/static>) render;
      app = render (import ./app);
    in

    html.html { lang = "en"; } [
      (html.head [
        (html.title "Hello, ''${name}")
        (html.style app.styles)
      ])

      (html.body [
        (html.div { id = "app"; } app.children)
      ])
    ]
  '')

  (paragraph [
    (code "render")
    " from "
    (code "<web/static>")
    " renders an app's initial state, returning its "
    (code "children")
    " and "
    (code "styles")
    ". Event handlers are omitted from the output."
  ])

  (heading "Render it")
  (paragraph "Load the Nix files, then render the page:")

  (listing "javascript" "render.js" ''
    import { globSync, readFileSync } from "node:fs";
    import { join } from "node:path";

    import { load, renderToString, unload } from "cursery";

    // Every Nix file under `src/`, by its path there.
    const files = Object.fromEntries(
      globSync("**/*.nix", { cwd: "src" }).map((file) => [
        file,
        readFileSync(join("src", file), "utf8"),
      ]),
    );

    const path = load(files);
    const html = renderToString(`''${path}/page.nix`, { name: "Nix" });
    unload(path);

    console.log(html);
  '')

  (paragraph [
    (code "load")
    " returns a store path for the files. The second argument to "
    (code "renderToString")
    " is passed to the page as its inputs. Running "
    (code "node render.js")
    " prints the HTML:"
  ])

  (listing "html" "Output" ''
    <!doctype html><html lang="en"><head><title>Hello, Nix… (truncated)
  '')

  (paragraph [
    "A loaded path can be rendered any number of times. "
    (code "unload")
    " releases it."
  ])
]
