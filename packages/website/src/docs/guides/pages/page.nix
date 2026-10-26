let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
    listing
    paragraph
    ;

  client =
    type: description:
    html.li [
      (code type)
      ": "
      description
    ];
in

import ../../article.nix "guides" "pages" [
  (paragraph [
    "The Vite plugin builds the pages in its "
    (code "pages")
    " option. Each has a "
    (html.a {
      class = link;
      href = "/docs/guides/structure/";
    } "server entry")
    " and a client, the code that runs in the browser."
  ])

  (heading "Declare pages")
  (paragraph "Pages are keyed by their path in the build output:")

  (listing "javascript" "vite.config.js" ''
    import cursery from "cursery/vite-plugin";
    import { defineConfig } from "vite";

    export default defineConfig({
      plugins: [
        cursery({
          pages: {
            "index.html": {
              entry: {
                server: "./src/page.nix",
                client: { type: "nix", path: "./src/app" },
              },
            },
            "settings/index.html": {
              entry: {
                server: "./src/page.nix",
                client: {
                  type: "nix",
                  path: "./src/settings",
                  effects: "./src/settings/effects.js",
                },
              },
            },
            "about/index.html": {
              entry: {
                server: "./src/about.nix",
                client: { type: "static" },
              },
            },
          },
        }),
      ],
    });
  '')

  (paragraph [
    "The dev server serves each page at its route, so "
    (code "settings/index.html")
    " is at "
    (code "/settings/")
    ". Paths are relative to the project root, and must stay inside it."
  ])

  (paragraph "Pages can share a server entry.")

  (heading "Clients")

  (paragraph [
    "A page's "
    (code "client")
    " has one of three types:"
  ])

  (html.ul { class = "mt-4 list-disc space-y-2 pl-6"; } [
    (client "nix" [
      "an app directory at "
      (code "path")
      ". The page renders it, and mounts it in the browser. "
      (code "effects")
      " is an optional module of "
      (html.a {
        class = link;
        href = "/docs/guides/host-io/";
      } "effects")
      "."
    ])

    (client "manual" [
      "a JavaScript module at "
      (code "path")
      ", responsible for hydrating the client. See "
      (html.a {
        class = link;
        href = "/docs/guides/embedding/";
      } "Embedding")
      "."
    ])

    (client "static" "no client. The page is HTML only.")
  ])

  (paragraph [
    "The client decides the server entry's inputs. Only "
    (code "nix")
    " clients fill "
    (code "children")
    " and "
    (code "assets")
    ", and "
    (code "static")
    " pages get no "
    (code "scripts")
    "."
  ])
]
