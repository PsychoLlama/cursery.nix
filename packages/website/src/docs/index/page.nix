# The docs' front page, pointing into each section.
let
  inherit (import <web/dom>) html;
  inherit (import ../prose.nix) card;
  sections = import ../sections.nix;
in
import ../layout.nix
  {
    title = "Documentation";
    section = null;
  }
  [
    (html.h1 { class = "text-4xl font-semibold tracking-tight"; } "Documentation")
    (html.div { class = "mt-8 grid gap-4 sm:grid-cols-2"; } (
      map (
        section:
        card {
          href = "/docs/${section.slug}/";
          inherit (section) title description;
        }
      ) sections
    ))
  ]
