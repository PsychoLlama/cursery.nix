let
  inherit (import <web/dom>) html;
in
import ../section.nix "reference" (html.p { class = "mt-10 text-[#6b6875]"; } "Nothing here yet.")
