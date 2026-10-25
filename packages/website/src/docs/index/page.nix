# The docs' front page, pointing into each section.
let
  inherit (import <web/dom>) html;
  sections = import ../sections.nix;

  card =
    {
      slug,
      title,
      description,
    }:
    html.a
      {
        href = "/docs/${slug}/";
        class = "block rounded-lg border border-[#2b2a33]/15 p-5 hover:border-[#c8553d]";
      }
      [
        (html.h2 { class = "font-semibold"; } title)
        (html.p { class = "mt-1 text-[15px] text-[#6b6875]"; } description)
      ];
in
import ../layout.nix
  {
    title = "Documentation";
    section = null;
  }
  [
    (html.h1 { class = "text-4xl font-semibold tracking-tight"; } "Documentation")
    (html.div { class = "mt-8 grid gap-4 sm:grid-cols-2"; } (map card sections))
  ]
