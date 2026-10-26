let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
    listing
    paragraph
    ;

  api = html.a {
    class = link;
    href = "/docs/reference/api/";
  } "API";
in

import ../../article.nix "reference" "vite-plugin" [
  (paragraph [
    "A "
    (html.a {
      class = link;
      href = "https://vite.dev";
    } "Vite")
    " plugin. It adds import queries (like Vite's "
    (code "?raw")
    ") that load Nix files into cursery's in-memory "
    (code "/nix/store")
    ". It can also render pages from Nix."
  ])

  (listing "javascript" "vite.config.js" ''
    import cursery from "cursery/vite-plugin";
    import { defineConfig } from "vite";

    export default defineConfig({
      plugins: [cursery()],
    });
  '')

  (paragraph [
    "To declare server and client entrypoints, see "
    (html.a {
      class = link;
      href = "/docs/guides/pages/";
    } "Pages")
    "."
  ])

  (paragraph "For TypeScript, add the queries' types:")

  (listing "jsonc" "tsconfig.json" ''
    {
      "compilerOptions": {
        // ...
        "types": ["vite/client", "cursery/vite-plugin/client"]
      }
    }
  '')

  (heading "Imports")

  (paragraph [
    "Each query takes a directory with a "
    (code "default.nix")
    ", or a "
    (code ".nix")
    " file, as the entry. The files are the entry, and every "
    (code ".nix")
    " file beside it and below. Edits to any of them update the import."
  ])

  (paragraph [
    "Relative paths resolve from the importing module. Paths starting with "
    (code "/")
    " resolve from Vite's root, then from the file system."
  ])

  (heading "?cursery:app")

  (listing "javascript" "Signature" ''
    app.mount(container, options?)
  '')

  (paragraph [
    "Loads the files, and renders the app into the element "
    (code "container")
    ". "
    (code "options")
    " are those of "
    (code "mount")
    " from the "
    api
    ". Returns a function that unmounts it. Throws if the app fails to mount."
  ])

  (listing "javascript" "Mounting" ''
    import app from "./app?cursery:app";

    const unmount = app.mount(document.getElementById("app"));
  '')

  (paragraph [
    "Edits hot reload every container the app is mounted into, keeping state. If the edited app fails to mount, the error is logged, and the last working version stays until the next edit."
  ])

  (heading "?cursery:store-path")

  (paragraph [
    "Loads the files, and returns the entry's store path, for "
    (code "mount")
    " and "
    (code "evaluate")
    " from the "
    api
    ". Edits load a new store path, and unload the old one."
  ])

  (listing "javascript" "Store paths" ''
    import path from "./app?cursery:store-path";
    // "/nix/store/…-source/default.nix"

    evaluate(`(import ''${path}).init`);
  '')

  (heading "?cursery:files")

  (paragraph [
    "Returns the files by path, for "
    (code "load")
    " from the "
    api
    ". Nothing is loaded automatically."
  ])

  (listing "javascript" "Files" ''
    import files from "./app?cursery:files";
    // { "./default.nix": "…", "./view.nix": "…" }

    const path = load(files);
    evaluate(`import ''${path}/view.nix`);
  '')
]
