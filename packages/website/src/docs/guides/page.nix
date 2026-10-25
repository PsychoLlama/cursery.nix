let
  inherit (import <web/dom>) html;
  inherit (import ../prose.nix) card;
  guides =
    (builtins.head (builtins.filter (section: section.slug == "guides") (import ../sections.nix)))
    .pages;
in
import ../section.nix "guides" (
  html.div { class = "mt-8 grid gap-4 sm:grid-cols-2"; } (
    map (
      guide:
      card {
        href = "/docs/guides/${guide.slug}/";
        inherit (guide) title description;
      }
    ) guides
  )
)
