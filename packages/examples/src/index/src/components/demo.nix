# An editor next to the app it describes, running in the playground frame.
let
  inherit (import <web/dom>) html;
  inherit (import <web/io>) call dispatch pipe;
  inherit (import ../theme.nix) heading frame;

  # Syntax highlighting, tokenized with a regex. Good enough for the demo.
  keywords = [
    "let"
    "in"
    "inherit"
    "import"
  ];

  highlight =
    source:
    map (
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

  # Saves the edit, then shows the frame's error, if any.
  edit =
    event:
    let
      source = event.target.value;
    in
    pipe source [
      (dispatch "source")
      (_: call "preview" source)
      (dispatch "error")
    ];

  # Shared by the editor and its highlighting, laid over each other.
  text = "col-start-1 row-start-1 p-5 font-mono text-sm leading-relaxed whitespace-pre";
in

{ source, error }:
html.div [
  (heading "Try it")
  (html.p { class = "mt-2"; } "A minimal cursery.nix app. Edit it and see.")

  (html.div { class = "${frame} mt-6 grid bg-white sm:grid-cols-[minmax(0,1fr)_14rem]"; } [
    (html.div { class = "flex min-w-0 flex-col bg-[#2b2a33] text-[#e8e1d4]"; } [
      (html.div { class = "overflow-x-auto"; } [
        (html.div { class = "grid w-max min-w-full"; } [
          # A trailing space keeps a final empty line, as the editor shows it.
          (html.pre {
            class = text;
            aria-hidden = "true";
          } (html.code (highlight source ++ [ " " ])))
          (html.textarea {
            id = "demo-source";
            class = "${text} resize-none overflow-hidden bg-transparent text-transparent caret-[#e8e1d4] outline-none selection:bg-white/20";
            aria-label = "Source";
            spellcheck = "false";
            wrap = "off";
            value = source;
            on.input = edit;
          })
        ])
      ])
      (
        if error == null then
          null
        else
          html.pre {
            class = "max-h-48 overflow-auto border-t border-white/10 bg-[#3a2a2e] px-5 py-3 font-mono text-xs text-[#f0b0a0]";
          } error
      )
    ])

    (html.div { class = "grid min-h-40 bg-[#fbf8f2]"; } [
      (html.iframe {
        id = "demo-preview";
        src = "/playground-frame/";
        title = "Demo";
        class = "size-full min-h-40 noscript:hidden";
      })
      (html.p {
        class = "hidden place-self-center p-6 text-center text-sm text-[#6b6875] noscript:block";
      } "Enable JavaScript to try the demo.")
    ])
  ])
]
