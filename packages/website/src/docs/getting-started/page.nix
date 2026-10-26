let
  inherit (import <web/dom>) html;
  inherit (import ../prose.nix)
    code
    heading
    link
    paragraph
    shell
    ;

  file =
    path: description:
    html.li [
      (code path)
      ": "
      description
    ];
in

import ../section.nix "getting-started" [
  (paragraph [
    "Start a new app from the flake template. You'll need "
    (html.a {
      href = "https://nixos.org/download/";
      class = link;
    } "Nix")
    " with flakes enabled."
  ])

  (heading "Create the app")
  (paragraph "Make a directory for it and fill it from the template:")

  (shell [
    "mkdir my-app && cd my-app"
    "nix flake init -t github:PsychoLlama/cursery.nix"
  ])

  (paragraph "It's a Vite project with a counter app:")

  (html.ul { class = "mt-4 list-disc space-y-2 pl-6"; } [
    (file "src/app/default.nix" "the app: its state, how actions change it, and what it renders.")
    (file "src/page.nix" "the HTML page around the app, rendered ahead of time.")
    (file "vite.config.js" "the pages to build, and the app each one mounts.")
    (file "flake.nix" "a dev shell with Node and pnpm.")
  ])

  (heading "Start the dev server")
  (paragraph "Enter the dev shell, install dependencies, and start Vite:")

  (shell [
    "nix develop"
    "pnpm install"
    "pnpm dev"
  ])

  (paragraph [
    "Open "
    (html.a {
      href = "http://localhost:5173";
      class = link;
    } "localhost:5173")
    " and click around. Then edit "
    (code "src/app/default.nix")
    ". Vite swaps in the new code as you save, and the app keeps its state."
  ])

  (heading "Build for production")
  (shell [ "pnpm build" ])

  (paragraph [
    "The site lands in "
    (code "dist/")
    ", static files to host anywhere. Try it locally with "
    (code "pnpm preview")
    "."
  ])
]
