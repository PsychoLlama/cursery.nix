let
  inherit (import <web/dom>) html;
  inherit (import ../prose.nix) card;
  pages =
    (builtins.head (builtins.filter (section: section.slug == "reference") (import ../sections.nix)))
    .pages;
in
import ../section.nix "reference" (
  html.div { class = "mt-8 grid gap-4 sm:grid-cols-2"; } (
    map (
      page:
      card {
        href = "/docs/reference/${page.slug}/";
        inherit (page) title description;
      }
    ) pages
  )
)
