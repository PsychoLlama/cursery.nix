let
  inherit (import <web/dom>) html;
  inherit (import ../theme.nix) link repository;
in

{ }:
html.header { class = "flex items-center gap-3 py-8"; } [
  (html.span { class = "text-lg font-semibold tracking-tight"; } "cursery.nix")

  (html.nav { class = "ml-auto flex gap-5"; } [
    (html.a {
      href = "#examples";
      class = link;
    } "Examples")

    (html.a {
      href = "/docs/";
      class = link;
    } "Docs")

    (html.a {
      href = repository;
      class = link;
    } "GitHub")
  ])
]
