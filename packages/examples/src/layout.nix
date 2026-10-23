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
    assets
  ])
  (html.body [
    body
    children
    scripts
  ])
]
