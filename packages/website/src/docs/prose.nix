# Pieces for writing docs.

let
  inherit (import <web/dom>) html;
  theme = import ../index/app/theme.nix;

  # The highlighting theme's background (see `highlight.ts`), for code blocks.
  background = "bg-[#282c34]";
in

{
  inherit (theme) code link;

  # A section heading, linkable by a slug of its title, e.g. `#io-dispatch`
  # for "io.dispatch". The link shows on hover.
  heading =
    title:

    let
      letters = string: builtins.genList (i: builtins.substring i 1 string) 26;
      lower =
        builtins.replaceStrings (letters "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
          (letters "abcdefghijklmnopqrstuvwxyz")
          title;
      words = builtins.filter (part: builtins.isString part && part != "") (
        builtins.split "[^a-z0-9]+" lower
      );
      slug = builtins.concatStringsSep "-" words;
    in

    html.h2
      {
        id = slug;
        class = "group mt-12 scroll-mt-8 text-2xl font-semibold tracking-tight";
      }
      [
        title
        (html.a {
          href = "#${slug}";
          class = "ml-2 text-[#6b6875] opacity-0 group-hover:opacity-100 hover:text-[#c8553d] focus:opacity-100";
          aria-label = "Link to this section";
        } "#")
      ];
  paragraph = html.p { class = "mt-4"; };

  # Source code, given its language and file name. Highlighted at build, by
  # `highlight.ts`.
  listing =
    language: name: source:
    html.figure { class = "${theme.frame} mt-4 ${background}"; } [
      (html.figcaption {
        class = "border-b border-white/10 px-4 py-2 font-mono text-xs text-[#e8e1d4]/60";
      } name)

      (html.pre {
        class = "overflow-x-auto px-4 py-3 font-mono text-sm text-[#e8e1d4]";
        data-language = language;
      } source)
    ];

  # A link to another page, with its title and description.
  card =
    {
      href,
      title,
      description,
    }:
    html.a
      {
        inherit href;
        class = "block rounded-lg border border-[#2b2a33]/15 p-5 hover:border-[#c8553d]";
      }
      [
        (html.h2 { class = "font-semibold"; } title)
        (html.p { class = "mt-1 text-[15px] text-[#6b6875]"; } description)
      ];

  # Commands to run in a shell, one per line.
  shell =
    commands:
    html.pre
      {
        class = "${theme.frame} mt-4 overflow-x-auto ${background} px-4 py-3 font-mono text-sm text-[#e8e1d4]";
      }
      (
        map (command: [
          (html.span { class = "text-[#b8d68a] select-none"; } "$ ")
          command
          "\n"
        ]) commands
      );
}
