# The page around each example, given its title and body.
title: body:
{
  children,
  assets,
  scripts,
}:
let
  inherit (import <web/dom>) html;
in
html.html { lang = "en"; } [
  (html.head [
    (html.meta { charset = "utf-8"; })
    (html.meta {
      name = "viewport";
      content = "width=device-width, initial-scale=1";
    })
    (html.title title)
    (html.link {
      rel = "icon";
      type = "image/svg+xml";
      href = "/favicon.svg";
    })
    # Page views. It skips localhost and frames, like the playground's.
    (html.script {
      data-goatcounter = "https://cursery.goatcounter.com/count";
      async = true;
      src = "//gc.zgo.at/count.js";
    })
    assets
  ])
  (html.body [
    body
    children
    scripts
  ])
]
