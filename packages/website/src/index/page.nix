# The homepage. The app in `src/` renders everything in it.

let
  inherit (import <web/dom>) html;

  stylesheet = html.link {
    rel = "stylesheet";
    href = "/src/index/index.css";
  };
in

inputs:
import ../layout.nix "cursery.nix: interactive web apps in pure Nix" [ ] (
  inputs // { assets = inputs.assets ++ [ stylesheet ]; }
)
