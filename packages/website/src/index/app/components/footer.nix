let
  inherit (import <web/dom>) html;
  inherit (import ../theme.nix) link repository;
in

{ }:
html.footer { class = "border-t border-[#2b2a33]/15 py-8 text-sm text-[#6b6875]"; } [
  "Free software under the "
  (html.a {
    href = "${repository}/blob/main/LICENSE";
    class = link;
  } "GPL-3.0")
  "."
]
