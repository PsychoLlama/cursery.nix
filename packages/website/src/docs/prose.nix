# Pieces for writing docs.
let
  inherit (import <web/dom>) html;
  theme = import ../index/src/theme.nix;
in
{
  inherit (theme) code link;

  heading = html.h2 { class = "mt-12 text-2xl font-semibold tracking-tight"; };
  paragraph = html.p { class = "mt-4"; };

  # Source code, given its file name.
  listing =
    name: source:
    html.figure { class = "${theme.frame} mt-4 bg-[#2b2a33]"; } [
      (html.figcaption {
        class = "border-b border-white/10 px-4 py-2 font-mono text-xs text-[#e8e1d4]/60";
      } name)
      (html.pre { class = "overflow-x-auto px-4 py-3 font-mono text-sm text-[#e8e1d4]"; } source)
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
        class = "${theme.frame} mt-4 overflow-x-auto bg-[#2b2a33] px-4 py-3 font-mono text-sm text-[#e8e1d4]";
      }
      (
        map (command: [
          (html.span { class = "text-[#b8d68a] select-none"; } "$ ")
          command
          "\n"
        ]) commands
      );
}
