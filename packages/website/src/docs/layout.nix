# The page around each doc, given its title, the slug of its section (or
# null), and its body.
{ title, section }:
body: inputs:
let
  inherit (import <web/dom>) html;
  inherit (import ../index/src/theme.nix) link repository;
  sections = import ./sections.nix;

  stylesheet = html.link {
    rel = "stylesheet";
    href = "/docs/docs.css";
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

  entry =
    { slug, title, ... }:
    html.li [
      (html.a {
        href = "/docs/${slug}/";
        class = [
          "block rounded px-3 py-1.5 hover:text-[#c8553d]"
          (if slug == section then "bg-[#2b2a33]/[0.07] font-medium" else "text-[#6b6875]")
        ];
      } title)
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
