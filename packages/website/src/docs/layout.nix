# The page around each doc, given its title, the slugs of its section (or
# null) and page (if it's one of the section's pages), and its body.
{
  title,
  section,
  page ? null,
}:
body: inputs:
let
  inherit (import <web/dom>) html;
  inherit (import ../index/src/theme.nix) link repository;
  sections = import ./sections.nix;

  stylesheet = html.link {
    rel = "stylesheet";
    href = "/src/docs/docs.css";
  };

  header = html.header { class = "flex items-center gap-3 py-8"; } [
    (html.a {
      href = "/";
      class = "text-lg font-semibold tracking-tight";
    } "cursery.nix")
    (html.a {
      href = "/docs/";
      class = "text-[#6b6875] hover:text-[#c8553d]";
    } "Docs")
    (html.nav { class = "ml-auto flex gap-5"; } [
      (html.a {
        href = repository;
        class = link;
      } "GitHub")
    ])
  ];

  item =
    href: title: current:
    html.a {
      inherit href;
      class = [
        "block rounded px-3 py-1.5 hover:text-[#c8553d]"
        (if current then "bg-[#2b2a33]/[0.07] font-medium" else "text-[#6b6875]")
      ];
    } title;

  entry =
    {
      slug,
      title,
      pages,
      ...
    }:
    html.li [
      (item "/docs/${slug}/" title (slug == section && page == null))
      (html.ul { class = "mt-1 ml-3 space-y-1 border-l border-[#2b2a33]/15 pl-2"; } (
        map (
          entry:
          html.li (item "/docs/${slug}/${entry.slug}/" entry.title (slug == section && entry.slug == page))
        ) pages
      ))
    ];

  sidebar = html.nav { class = "md:sticky md:top-8 md:self-start"; } [
    (html.ul { class = "-mx-3 space-y-1 text-[15px]"; } (map entry sections))
  ];
in
import ../layout.nix "${title} · cursery.nix docs" [
  (html.div { class = "mx-auto max-w-5xl px-6"; } [
    header
    (html.div { class = "grid gap-10 pt-6 pb-20 md:grid-cols-[12rem_1fr]"; } [
      sidebar
      (html.main { class = "min-w-0"; } body)
    ])
  ])
] (inputs // { assets = inputs.assets ++ [ stylesheet ]; })
