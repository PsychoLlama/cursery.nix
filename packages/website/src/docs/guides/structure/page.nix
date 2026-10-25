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
import ../../article.nix "guides" "structure" [
  (paragraph [
    "A page has two Nix entry points: the app, which runs in the browser, and the server entry, which renders the HTML around it. Both are named in the Vite plugin's "
    (code "pages")
    " option."
  ])

  (heading "The app")
  (paragraph [
    "An app is a directory. Its "
    (code "default.nix")
    " returns an attrset:"
  ])
  (listing "nix" "src/app/default.nix" ''
    let
      inherit (import <web/dom>) html;
      inherit (import <web/style>) css;
      io = import <web/io>;
    in
    {
      # Global CSS for the page.
      styles = "body { font-family: system-ui; }";

      # The initial state.
      init = 0;

      # The next state, given the current one and an action.
      update = count: action:
        if action.type == "increment" then count + 1 else count;

      # The children to render, given the state.
      render = count: [
        (html.h1 { class = css "color: teal;"; } "Clicked ''${toString count} times")
        (html.button {
          on.click = event: io.dispatch "increment" null;
        } "Increment")
      ];
    }
  '')
  (paragraph [
    "Every attribute is optional, but "
    (code "init")
    " and "
    (code "update")
    " come as a pair. Without them, the app has no state."
  ])
  (paragraph [
    "The app is every "
    (code ".nix")
    " file in its directory and below. Split it up with relative imports, like "
    (code "import ./header.nix")
    "."
  ])

  (heading "Actions")
  (paragraph [
    "Handlers return effects. "
    (code "io.dispatch")
    " sends an action, "
    (code "{ type; payload; }")
    ", to "
    (code "update")
    ", and the app re-renders with the new state."
  ])
  (paragraph [
    (code "update")
    " can return an effect instead of a state, to call out to the host. See "
    (html.a {
      class = link;
      href = "/docs/guides/host-io/";
    } "Host IO")
    "."
  ])

  (heading "The server entry")
  (paragraph "The server entry is a function that returns the page's HTML. It runs at build time, and on each request in dev:")
  (listing "nix" "src/page.nix" ''
    {
      children,
      assets,
      scripts,
    }:
    let
      inherit (import <web/dom>) html;
    in
    html.html { lang = "en"; } [
      (html.head [
        (html.title "Counter")
        assets
      ])
      (html.body [
        children
        scripts
      ])
    ]
  '')
  (paragraph "Its inputs:")
  (html.ul { class = "mt-4 list-disc space-y-2 pl-6"; } [
    (html.li [
      (code "children")
      ": the app's initial render, in the element it mounts into."
    ])
    (html.li [
      (code "assets")
      ": what the app needs in the head, like its styles."
    ])
    (html.li [
      (code "scripts")
      ": the script that mounts the app."
    ])
  ])
  (paragraph "Each is empty when the page doesn't use it.")
]
