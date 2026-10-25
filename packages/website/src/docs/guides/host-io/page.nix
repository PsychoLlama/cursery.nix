let
  inherit (import <web/dom>) html;
  inherit (import ../../prose.nix)
    code
    heading
    link
    listing
    paragraph
    ;
in
import ../../article.nix "guides" "host-io" [
  (paragraph "Apps and the JavaScript host can talk both ways: Nix calls JavaScript through effects, and JavaScript dispatches actions to the app. Both are optional.")

  (heading "Define effects")
  (paragraph "Effects are functions, by name. They can return promises:")
  (listing "javascript" "src/effects.js" ''
    export default {
      copy: (text) => navigator.clipboard.writeText(text),
      paste: () => navigator.clipboard.readText(),
    };
  '')
  (paragraph [
    "Name the module in a page's client, in the Vite plugin's "
    (code "pages")
    ":"
  ])
  (listing "javascript" "vite.config.js" ''
    client: { type: "nix", path: "./app", effects: "./effects.js" },
  '')
  (paragraph [
    "Or pass them to "
    (code "mount")
    ", when "
    (html.a {
      class = link;
      href = "/docs/guides/embedding/";
    } "embedding an app")
    ":"
  ])
  (listing "javascript" "main.js" ''
    import app from "./app?cursery:app";
    import effects from "./effects.js";

    app.mount(document.getElementById("app"), { effects });
  '')

  (heading "Call effects")
  (paragraph [
    "Handlers call an effect with "
    (code "io.call")
    ", given its name and input. In "
    (code "io.pipe")
    ", each step gets the output of the last:"
  ])
  (listing "nix" "src/app/default.nix" ''
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
  (paragraph "Inputs and outputs must be JSON-compatible.")

  (heading "Dispatch from JavaScript")
  (paragraph [
    (code "dispatch")
    " sends an action to the app mounted into an element, as "
    (code "io.dispatch")
    " does from a handler:"
  ])
  (listing "javascript" "main.js" ''
    import { dispatch } from "cursery";

    import app from "./app?cursery:app";

    const container = document.getElementById("app");
    app.mount(container);

    setInterval(() => {
      // The action's type and payload. The app renders before this returns.
      dispatch(container, "tick", Date.now());
    }, 1000);
  '')
  (paragraph "The payload must be JSON-compatible.")
]
