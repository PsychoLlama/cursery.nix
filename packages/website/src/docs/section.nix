# A section's front page, given its slug and body.
slug: body:
let
  inherit (import <web/dom>) html;
  section = builtins.head (builtins.filter (section: section.slug == slug) (import ./sections.nix));
in
import ./layout.nix
  {
    inherit (section) title;
    section = slug;
  }
  [
    (html.h1 { class = "text-4xl font-semibold tracking-tight"; } section.title)
    body
  ]
