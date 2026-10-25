let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
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

  (paragraph [
    "To give the app "
    (html.a {
      class = link;
      href = "/docs/guides/host-io/";
    } "effects")
    ", pass them in "
    (code "mount")
    "'s options."
  ])
]
