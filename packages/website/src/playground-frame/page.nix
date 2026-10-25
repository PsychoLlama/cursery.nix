# An empty page that renders apps posted to it (see `main.ts`), for live
# demos in an iframe.
let
  inherit (import <web/dom>) html;

  styles = html.style ''
    body {
      display: grid;
      place-items: center;
      min-height: 100vh;
      margin: 0;
      font: 16px/1.5 ui-sans-serif, system-ui, sans-serif;
      color: #2b2a33;
      background: #fbf8f2;
    }

    button {
      padding: 0.5rem 1rem;
      border: 0;
      border-radius: 0.375rem;
      font: inherit;
      font-weight: 500;
      white-space: nowrap;
      color: white;
      background: #c8553d;
      cursor: pointer;
      touch-action: manipulation;
    }

    button:hover {
      background: #b2472f;
    }

    button:active {
      translate: 0 1px;
    }
  '';
in
inputs:
import ../layout.nix "cursery.nix playground frame" [ (html.div { id = "app"; }) ] (
  inputs // { assets = inputs.assets ++ [ styles ]; }
)
