# A section's front page, given its slug.
slug:
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
    (html.p { class = "mt-5 text-lg"; } section.description)
    (html.p { class = "mt-10 text-[#6b6875]"; } "Nothing here yet.")
  ]
