# Pieces for writing docs.
let
  inherit (import <web/dom>) html;
  theme = import ../index/src/theme.nix;
in
{
  inherit (theme) code link;

  heading = html.h2 { class = "mt-12 text-2xl font-semibold tracking-tight"; };
  paragraph = html.p { class = "mt-4"; };

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
