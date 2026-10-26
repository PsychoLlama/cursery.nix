# The page around each example, given its title and body.
title: body:
{
  children,
  assets,
  scripts,
  analytics ? true,
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

    (
      # Open source analytics tool: https://goatcounter.com
      #
      # As privacy-preserving as possible while still answering how many
      # views, which pages, and where from.
      #
      # About the same info as request headers, but without having to run
      # a server.
      if analytics then
        html.script {
          data-goatcounter = "https://cursery.goatcounter.com/count";
          async = true;
          src = "//gc.zgo.at/count.js";
        }
      else
        null
    )

    assets
  ])

  (html.body [
    body
    children
    scripts
  ])
]
