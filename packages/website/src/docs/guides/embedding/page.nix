let
  inherit (import ../../prose.nix)
    code
    heading
    listing
    paragraph
    shell
    ;
in
import ../../article.nix "guides" "embedding" [
  (paragraph [
    "Pages declared in the Vite plugin's "
    (code "pages")
    " option mount their apps automatically. To add an app to an existing JavaScript application instead, import it and mount it yourself."
  ])

  (heading "Add the plugin")
  (shell [ "pnpm add cursery" ])
  (listing "javascript" "vite.config.js" ''
    import cursery from "cursery/vite-plugin";
    import { defineConfig } from "vite";

    export default defineConfig({
      plugins: [cursery()],
    });
  '')
  (paragraph [
    "For TypeScript, add "
    (code "cursery/vite-plugin/client")
    " to "
    (code "compilerOptions.types")
    "."
  ])

  (heading "Mount the app")
  (listing "nix" "app/default.nix" ''
    let
      inherit (import <web/dom>) html;
    in
    {
      render = state: html.p "Hello from Nix";
    }
  '')
  (paragraph [
    "Import the app's directory with "
    (code "?cursery:app")
    ", and mount it into an element:"
  ])
  (listing "javascript" "main.js" ''
    import app from "./app?cursery:app";

    // Edits to the app's files hot reload it, keeping its state.
    const unmount = app.mount(document.getElementById("app"));
  '')

  (heading "Add effects")
  (paragraph [
    "Optionally, Nix can call out to JavaScript for host IO:"
  ])
  (listing "javascript" "main.js" ''
    app.mount(document.getElementById("app"), {
      effects: {
        copy: (text) => navigator.clipboard.writeText(text),
        paste: () => navigator.clipboard.readText(),
      },
    });
  '')
  (paragraph [
    "Handlers call them with "
    (code "io.call")
    ", given a name and input. In "
    (code "io.pipe")
    ", each step gets the output of the last:"
  ])
  (listing "nix" "app/default.nix" ''
    let
      inherit (import <web/dom>) html;
      io = import <web/io>;
    in
    {
      init = "";
      update = state: action: action.payload;
      render = text: [
        (html.button { on.click = event: io.call "copy" "Hello"; } "Copy")
        (html.button {
          on.click = event: io.pipe null [
            (_: io.call "paste" null)
            # What the promise resolved to.
            (text: io.dispatch "pasted" text)
          ];
        } "Paste")
        (html.p text)
      ];
    }
  '')
  (paragraph "Inputs and outputs are converted as JSON would have them.")
]
