# The counter, running next to its source.
let
  inherit (import <web/dom>) html;
  inherit (import ../theme.nix) heading frame;

  app = import ../counter.nix;

  # A copy of `counter.nix`, as `builtins.readFile` isn't available. Keep
  # them in sync.
  source = ''
    let
      inherit (import <web/dom>) html;
      inherit (import <web/io>) dispatch;
    in
    {
      init = 0;
      update = count: action: count + 1;
      render =
        count:
        html.button {
          on.click = event: dispatch "increment" null;
        } "Clicked ''${toString count} times";
    }
  '';

  # Syntax highlighting, tokenized with a regex. Good enough for the demo.
  keywords = [
    "let"
    "in"
    "inherit"
    "import"
  ];

  highlight = map (
    token:
    if builtins.isString token then
      token
    else
      let
        text = builtins.head token;
        first = builtins.substring 0 1 text;
      in
      if first == ''"'' then
        html.span { class = "text-[#b8d68a]"; } text
      else if first == "<" then
        html.span { class = "text-[#8ec5d6]"; } text
      else if builtins.elem text keywords then
        html.span { class = "text-[#f0a07a]"; } text
      else
        text
  ) (builtins.split ''("[^"]*"|<[^>]*>|[A-Za-z_][A-Za-z0-9_.-]*)'' source);
in

{ counter }:
html.div [
  (heading "Try it")
  (html.p { class = "mt-2"; } [
    "This page is a cursery.nix app. Here's a piece of it, running next to its source."
  ])
  (html.div { class = "${frame} mt-6 grid bg-white sm:grid-cols-[minmax(0,1fr)_14rem]"; } [
    (html.pre {
      class = "overflow-x-auto bg-[#2b2a33] p-5 font-mono text-sm leading-relaxed text-[#e8e1d4]";
    } (html.code highlight))
    (html.div
      {
        class = "grid min-h-40 place-items-center bg-[#fbf8f2] p-6 [&_button]:rounded-md [&_button]:bg-[#c8553d] [&_button]:px-4 [&_button]:py-2 [&_button]:font-medium [&_button]:whitespace-nowrap [&_button]:text-white [&_button]:hover:bg-[#b2472f] [&_button]:active:translate-y-px";
      }
      [
        # Prerendered, the counter shows without JavaScript, but does nothing.
        (html.div { class = "noscript:hidden"; } (app.render counter))
        (html.p {
          class = "hidden text-center text-sm text-[#6b6875] noscript:block";
        } "Enable JavaScript to try the demo.")
      ]
    )
  ])
]
