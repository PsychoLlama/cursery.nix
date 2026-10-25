let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
    listing
    paragraph
    ;

  hostIo = html.a {
    class = link;
    href = "/docs/guides/host-io/";
  } "Host IO";
in
import ../../article.nix "reference" "api" [
  (paragraph [
    "The JavaScript exports of the "
    (code "cursery")
    " package. In Node, it reads its WebAssembly from disk. Elsewhere, it imports it as a bundled module."
  ])
  (listing "javascript" "Exports" ''
    import {
      dispatch,
      evaluate,
      load,
      mount,
      renderToString,
      unload,
      unmount,
    } from "cursery";
  '')

  (heading "load")
  (listing "javascript" "Signature" ''
    load(files)
  '')
  (paragraph [
    "Adds Nix files to the store. "
    (code "files")
    " maps paths to sources, e.g. from "
    (code "import.meta.glob")
    ". Returns their store path, the same one Nix gives the same files:"
  ])
  (listing "javascript" "Loading" ''
    // Sources by path, e.g. `./app/default.nix`.
    const files = import.meta.glob("./app/**/*.nix", {
      query: "?raw",
      import: "default",
      eager: true,
    });

    const path = load(files); // "/nix/store/…-source"
  '')
  (paragraph [
    "Paths are relative to the store path, so "
    (code "./app/default.nix")
    " and "
    (code "app/default.nix")
    " are the same file. Loaded files can import each other by relative path. Identical files share a store path. Nothing is evaluated."
  ])
  (paragraph "Throws if a path is outside the store path, or a source isn't a string.")

  (heading "unload")
  (listing "javascript" "Signature" ''
    unload(path)
  '')
  (paragraph [
    "Releases a store path from "
    (code "load")
    ". Its files stay available until every load of them is released. Throws if the path isn't loaded."
  ])

  (heading "evaluate")
  (listing "javascript" "Signature" ''
    evaluate(code)
  '')
  (paragraph [
    "Evaluates a Nix expression strictly, and returns it as JavaScript. Attribute sets become objects with a "
    (code "null")
    " prototype."
  ])
  (listing "javascript" "Evaluating" ''
    evaluate("1 + 2"); // 3
    evaluate("import ''${path}/config.nix");
  '')
  (paragraph [
    "Evaluation is pure: impure builtins don't exist. Loaded files can be imported, and read with "
    (code "builtins.readFile")
    ". The bundled libraries resolve through the search path, as "
    (code "<web/...>")
    "."
  ])
  (paragraph [
    "Throws on syntax and evaluation errors, and on results JavaScript can't represent: functions, and integers beyond 2"
    (html.sup "53")
    "."
  ])

  (heading "mount")
  (listing "javascript" "Signature" ''
    mount(container, path, options?)
  '')
  (paragraph [
    "Renders the app at "
    (code "path")
    " into the element "
    (code "container")
    ". "
    (code "path")
    " is a "
    (code "default.nix")
    ", or a directory with one, under a store path from "
    (code "load")
    "."
  ])
  (paragraph [
    (code "options.effects")
    " are the functions the app runs with "
    (code "io.call")
    ", by name. Each gets the input from Nix, and returns the output, or a promise of it. For usage, see "
    hostIo
    "."
  ])
  (paragraph [
    "The first mount replaces the container's contents. Mounting into it again, e.g. with a hot-reloaded path, updates the app in place: the DOM is patched to the new render, and the state carries over, ignoring the new "
    (code "init")
    ". The new options replace the old ones."
  ])
  (paragraph [
    "The app's global "
    (code "styles")
    " are adopted by the container's root, the document or a shadow root, while it's mounted."
  ])
  (paragraph "Throws if the app fails to evaluate or render, or an effect isn't a function. The container and state are left as they were.")

  (heading "unmount")
  (listing "javascript" "Signature" ''
    unmount(container)
  '')
  (paragraph "Removes the app mounted into the element, and clears its contents. Throws if nothing is mounted there.")

  (heading "dispatch")
  (listing "javascript" "Signature" ''
    dispatch(container, type, payload?)
  '')
  (paragraph [
    "Sends an action to the app mounted into the element, like "
    (code "io.dispatch type payload")
    " from Nix. "
    (code "payload")
    " is converted as JSON would, and defaults to "
    (code "null")
    ". The app renders before this returns. If "
    (code "update")
    " returns an effect, it runs in the dispatch's place. For usage, see "
    hostIo
    "."
  ])
  (paragraph [
    "Throws if nothing is mounted, the payload isn't JSON data, or the app is rendering. Also throws if "
    (code "update")
    " or its effect fails before waiting on a promise. Failures after that are logged."
  ])

  (heading "renderToString")
  (listing "javascript" "Signature" ''
    renderToString(path, inputs?)
  '')
  (paragraph [
    "Renders the page at "
    (code "path")
    " to HTML, prefixed with "
    (code "<!doctype html>")
    ". It needs no DOM. "
    (code "path")
    " is a "
    (code "default.nix")
    ", or a directory with one, under a store path from "
    (code "load")
    ". The page is a function of "
    (code "inputs")
    ", converted as JSON would, defaulting to "
    (code "{ }")
    ", that returns an "
    (code "html")
    " element. To write one, see "
    (html.a {
      class = link;
      href = "/docs/guides/pre-rendering/";
    } "Pre-rendering")
    "."
  ])
  (paragraph [
    "Throws if the inputs aren't JSON data, or the page fails to evaluate or isn't an "
    (code "html")
    " element."
  ])
]
