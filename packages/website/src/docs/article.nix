# One of a section's pages, given the slugs of both and its body.
section: slug: body:
let
  inherit (import <web/dom>) html;
  find = slug: list: builtins.head (builtins.filter (entry: entry.slug == slug) list);
  page = find slug (find section (import ./sections.nix)).pages;
in
import ./layout.nix
  {
    inherit (page) title;
    inherit section;
    page = slug;
  }
  [
    (html.h1 { class = "text-4xl font-semibold tracking-tight"; } page.title)
    body
  ]
